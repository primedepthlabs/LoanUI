// @/lib/commissionCalculation.ts

import { supabase } from "@/lib/supabaseClient";

interface CommissionResult {
  success: boolean;
  message: string;
  commissionsCreated?: number;
}

/**
 * Calculate and create commissions for a payment
 * Level 1 (Direct): 10%
 * Level 2+: 20% of remaining amount after previous level
 */
export async function calculateCommissions(
  paymentId: string,
  purchaserAgentId: string,
  planId: string,
  planAmount: number,
): Promise<CommissionResult> {
  try {
    // Get purchaser's sponsor chain
    const { data: purchaserAgent } = await supabase
      .from("agents")
      .select("sponsor_id")
      .eq("id", purchaserAgentId)
      .single();

    if (!purchaserAgent?.sponsor_id) {
      return {
        success: true,
        message: "No sponsor found - no commissions to create",
        commissionsCreated: 0,
      };
    }

    // Get max_depth from plan settings
    const { data: planSettings } = await supabase
      .from("plan_chain_settings")
      .select("max_depth")
      .eq("plan_id", planId)
      .single();

    const maxDepth = planSettings?.max_depth || 10;

    // Build sponsor chain up to max_depth
    const sponsorChain = await buildSponsorChain(
      purchaserAgent.sponsor_id,
      planId,
      maxDepth,
    );

    if (sponsorChain.length === 0) {
      return {
        success: true,
        message: "No eligible sponsors in chain",
        commissionsCreated: 0,
      };
    }

    // ✅ Fetch SINGLE global commission percentage (level = 0)
    const { data: commissionRule, error: rulesError } = await supabase
      .from("commission_rules")
      .select("percentage")
      .eq("level", 0) // Level 0 = global percentage for all levels
      .single();

    if (rulesError) {
      console.warn("No commission rule found, using default 10%");
    }

    const commissionPercentage = commissionRule?.percentage || 10;

    // ✅ Calculate commissions using SINGLE percentage for ALL levels
    const commissions: any[] = [];
    let remainingAmount = planAmount;

    for (let i = 0; i < sponsorChain.length; i++) {
      const level = i + 1;
      const sponsorId = sponsorChain[i];

      // Same percentage for all levels, calculated from remaining amount
      let commissionAmount = remainingAmount * (commissionPercentage / 100);

      // Round to 2 decimal places
      commissionAmount = Math.round(commissionAmount * 100) / 100;

      // Deduct from remaining
      remainingAmount -= commissionAmount;

      commissions.push({
        agent_id: sponsorId,
        from_agent_id: purchaserAgentId,
        plan_id: planId,
        commission_amount: commissionAmount,
        original_amount: planAmount,
        level: level,
        payment_id: paymentId,
        status: "paid",
        paid_at: new Date().toISOString(),
      });
    }
    // Insert all commissions
    const { error: insertError } = await supabase
      .from("commissions")
      .insert(commissions);

    if (insertError) throw insertError;

    return {
      success: true,
      message: `Created ${commissions.length} commission records`,
      commissionsCreated: commissions.length,
    };
  } catch (error) {
    console.error("Commission calculation error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to calculate commissions",
    };
  }
}

/**
 * Build chain of sponsors who have the specific plan
 */
async function buildSponsorChain(
  startSponsorId: string,
  planId: string,
  maxDepth: number,
): Promise<string[]> {
  const chain: string[] = [];
  let currentSponsorId: string | null = startSponsorId;
  let depth = 0;

  while (currentSponsorId && depth < maxDepth) {
    // Check if sponsor is active
    const { data: sponsorAgent } = await supabase
      .from("agents")
      .select("id, is_active")
      .eq("id", currentSponsorId)
      .single();

    // Add to chain if sponsor is active
    if (sponsorAgent?.is_active) {
      chain.push(currentSponsorId);
    }

    // Get next sponsor in chain
    const {
      data: nextSponsor,
    }: { data: { sponsor_id: string | null } | null } = await supabase
      .from("agents")
      .select("sponsor_id")
      .eq("id", currentSponsorId)
      .single();

    currentSponsorId = nextSponsor?.sponsor_id || null;
    depth++;
  }

  return chain;
}

/**
 * Update commission totals for agents
 */
export async function updateAgentCommissionTotals(agentId: string) {
  try {
    const { data: commissions } = await supabase
      .from("commissions")
      .select("commission_amount, status")
      .eq("agent_id", agentId);

    if (!commissions) return;

    const totalEarnings = commissions.reduce(
      (sum, c) => sum + Number(c.commission_amount),
      0,
    );

    const paidEarnings = commissions
      .filter((c) => c.status === "paid")
      .reduce((sum, c) => sum + Number(c.commission_amount), 0);

    const pendingEarnings = commissions
      .filter((c) => c.status === "pending")
      .reduce((sum, c) => sum + Number(c.commission_amount), 0);

    // You can store these in an agent_stats table if needed
    // For now, they're calculated on-demand in the dashboard
  } catch (error) {
    console.error("Error updating commission totals:", error);
  }
}
