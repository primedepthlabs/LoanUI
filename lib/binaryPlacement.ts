import { supabase } from "@/lib/supabaseClient";

interface PlacementResult {
  success: boolean;
  position?: {
    parent_id: string | null;
    position: string;
    level: number;
    child_slot: number; // 1-5
  };
  error?: string;
}

/**
 * Find the next available position in a tree for a specific plan
 * Supports 1-5 pairing limits dynamically
 */
export async function findNextAvailablePosition(
  sponsorId: string,
  planId: string
): Promise<PlacementResult> {
  try {
    // Get plan settings (pairing limit, max depth)
    const { data: planSettings } = await supabase
      .from("plan_chain_settings")
      .select("pairing_limit, max_depth")
      .eq("plan_id", planId)
      .maybeSingle();

    const pairingLimit = planSettings?.pairing_limit || 2; // Default binary
    const maxDepth = planSettings?.max_depth || 50;

    // Check if sponsor exists in this plan's tree
    const { data: sponsorPosition } = await supabase
      .from("plan_binary_positions")
      .select("*")
      .eq("agent_id", sponsorId)
      .eq("plan_id", planId)
      .maybeSingle();

    if (!sponsorPosition) {
      return {
        success: false,
        error: "Sponsor is not positioned in this plan's tree",
      };
    }

    // Check if we've reached max depth
    if (sponsorPosition.level >= maxDepth) {
      return {
        success: false,
        error: "Maximum tree depth reached",
      };
    }

    // Check available child slots (1 to pairingLimit)
    for (let slot = 1; slot <= pairingLimit; slot++) {
      const childField = `child_${slot}_id`;
      if (!sponsorPosition[childField]) {
        return {
          success: true,
          position: {
            parent_id: sponsorId,
            position: `child_${slot}`,
            level: sponsorPosition.level + 1,
            child_slot: slot,
          },
        };
      }
    }

    // All slots filled, find next available in downline (breadth-first)
    const nextAvailable = await findNextAvailableInDownline(
      sponsorId,
      planId,
      maxDepth,
      pairingLimit
    );
    return nextAvailable;
  } catch (error) {
    console.error("Error finding position:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Breadth-first search to find next available position in downline
 */
async function findNextAvailableInDownline(
  rootAgentId: string,
  planId: string,
  maxDepth: number,
  pairingLimit: number
): Promise<PlacementResult> {
  try {
    // Get all positions in this plan's tree
    const { data: allPositions } = await supabase
      .from("plan_binary_positions")
      .select("*")
      .eq("plan_id", planId)
      .order("level", { ascending: true });

    if (!allPositions || allPositions.length === 0) {
      return { success: false, error: "No positions found" };
    }

    // Build a queue for breadth-first search
    const queue: string[] = [rootAgentId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentAgentId = queue.shift()!;
      if (visited.has(currentAgentId)) continue;
      visited.add(currentAgentId);

      const currentPosition = allPositions.find(
        (p) => p.agent_id === currentAgentId
      );
      if (!currentPosition) continue;

      // Check if max depth reached
      if (currentPosition.level >= maxDepth) continue;

      // Check all child slots (1 to pairingLimit)
      for (let slot = 1; slot <= pairingLimit; slot++) {
        const childField = `child_${slot}_id`;

        if (!currentPosition[childField]) {
          // Found empty slot!
          return {
            success: true,
            position: {
              parent_id: currentAgentId,
              position: `child_${slot}`,
              level: currentPosition.level + 1,
              child_slot: slot,
            },
          };
        } else {
          // Add child to queue for further searching
          queue.push(currentPosition[childField]);
        }
      }
    }

    return {
      success: false,
      error: "No available positions found in downline",
    };
  } catch (error) {
    console.error("Error in downline search:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function placeAgentInBinaryTree(
  agentId: string,
  planId: string,
  sponsorId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // FIX 1: Check if agent already exists in this plan's tree
    const { data: existingPosition } = await supabase
      .from("plan_binary_positions")
      .select("*")
      .eq("agent_id", agentId)
      .eq("plan_id", planId)
      .maybeSingle();

    if (existingPosition) {
      return { success: true }; // Already placed
    }

    // FIX 1: Check if agent owns this plan (source of truth)
    const { data: agentPlan } = await supabase
      .from("agent_plans")
      .select("id")
      .eq("agent_id", agentId)
      .eq("plan_id", planId)
      .maybeSingle();

    if (!agentPlan) {
      return {
        success: false,
        error: "Agent must own the plan before being placed in tree",
      };
    }

    // Handle root placement (no sponsor)
    if (!sponsorId) {
      // FIX 1: Only allow ONE root per plan
      const { data: existingRoot } = await supabase
        .from("plan_binary_positions")
        .select("id")
        .eq("plan_id", planId)
        .eq("position", "root")
        .maybeSingle();

      if (existingRoot) {
        return {
          success: false,
          error: "Root already exists for this plan",
        };
      }

      // FIX 1: Ensure this is the only plan owner trying to become root
      const { data: allPlanOwners } = await supabase
        .from("agent_plans")
        .select("agent_id")
        .eq("plan_id", planId);

      // If there are other plan owners, they should have sponsors
      if (allPlanOwners && allPlanOwners.length > 1) {
        return {
          success: false,
          error: "Cannot create root - other agents already own this plan",
        };
      }

      // Create root position
      const { error } = await supabase.from("plan_binary_positions").insert({
        agent_id: agentId,
        plan_id: planId,
        parent_id: null,
        position: "root",
        level: 1,
      });

      if (error) throw error;
      return { success: true };
    }

    // FIX 1: Verify sponsor owns this plan (source of truth check)
    const { data: sponsorPlan } = await supabase
      .from("agent_plans")
      .select("id")
      .eq("agent_id", sponsorId)
      .eq("plan_id", planId)
      .maybeSingle();

    if (!sponsorPlan) {
      return {
        success: false,
        error: "Sponsor does not own this plan",
      };
    }

    // FIX 1: Check if sponsor exists in THIS plan's tree
    // No auto-insertion - if sponsor not in tree, reject placement
    const { data: sponsorPosition } = await supabase
      .from("plan_binary_positions")
      .select("*")
      .eq("agent_id", sponsorId)
      .eq("plan_id", planId)
      .maybeSingle();

    if (!sponsorPosition) {
      return {
        success: false,
        error: "Sponsor is not positioned in this plan's tree",
      };
    }

    // Sponsor exists in tree, find next available position
    const placementResult = await findNextAvailablePosition(sponsorId, planId);

    if (!placementResult.success || !placementResult.position) {
      return {
        success: false,
        error: placementResult.error || "Could not find available position",
      };
    }

    const { parent_id, position, level, child_slot } = placementResult.position;

    // Insert new position
    const { error: insertError } = await supabase
      .from("plan_binary_positions")
      .insert({
        agent_id: agentId,
        plan_id: planId,
        parent_id: parent_id,
        position: position,
        level: level,
      });

    if (insertError) throw insertError;

    // Update parent's child_X_id field
    const updateField = `child_${child_slot}_id`;
    const { error: updateError } = await supabase
      .from("plan_binary_positions")
      .update({ [updateField]: agentId })
      .eq("agent_id", parent_id!)
      .eq("plan_id", planId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error) {
    console.error("Error placing agent:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get the complete tree for a specific plan starting from an agent
 */
export async function getBinaryTreeForPlan(
  agentId: string,
  planId: string
): Promise<any> {
  try {
    const { data: allPositions, error } = await supabase
      .from("plan_binary_positions")
      .select("*")
      .eq("plan_id", planId);

    // Explicit null/error check
    if (error) {
      console.error("Error fetching positions:", error);
      return null;
    }

    if (
      !allPositions ||
      !Array.isArray(allPositions) ||
      allPositions.length === 0
    ) {
      return null;
    }

    // Now TypeScript knows allPositions is definitely a non-null array
    const positions = allPositions;

    // Build tree recursively
    function buildTree(currentAgentId: string): any {
      if (!positions) return null; // Extra null check for TypeScript

      const position = positions.find((p) => p.agent_id === currentAgentId);
      if (!position) return null;

      // Build children array from child_1 to child_5
      const children: any[] = [];
      for (let i = 1; i <= 5; i++) {
        const childField = `child_${i}_id`;
        if (position[childField]) {
          const child = buildTree(position[childField]);
          if (child) children.push(child);
        }
      }

      return {
        ...position,
        children,
      };
    }

    return buildTree(agentId);
  } catch (error) {
    console.error("Error getting tree:", error);
    return null;
  }
}
