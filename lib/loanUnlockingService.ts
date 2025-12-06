// lib/loanUnlockingService.ts

import { supabase } from "@/lib/supabaseClient";

export interface LoanUnlockStatus {
  loanId: string;
  isUnlocked: boolean;
  reason: string;
  requiredLoanType?: string;
}

/**
 * Check if a loan is unlocked for a user
 * @param userId - The user's ID
 * @param loanId - The loan option ID to check
 * @param loanSortOrder - The sort order of the loan (1st, 2nd, 3rd, etc.)
 * @returns LoanUnlockStatus object with unlock status and reason
 */
export async function checkLoanUnlockStatus(
  userId: string,
  loanId: string,
  loanSortOrder: number
): Promise<LoanUnlockStatus> {
  try {
    // First loan is always unlocked
    if (loanSortOrder === 1) {
      return {
        loanId,
        isUnlocked: true,
        reason: "First loan is always available",
      };
    }

    // Get all loan options to find the previous loan
    const { data: loanOptions, error: optionsError } = await supabase
      .from("loan_options")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (optionsError) throw optionsError;

    // Find the previous loan (the one that must be completed)
    const previousLoan = loanOptions?.find(
      (loan) => loan.sort_order === loanSortOrder - 1
    );

    if (!previousLoan) {
      return {
        loanId,
        isUnlocked: false,
        reason: "Previous loan not found in system",
      };
    }

    // Check if user has completed the previous loan
    const { data: userLoans, error: loansError } = await supabase
      .from("loan_applications")
      .select("*")
      .eq("user_id", userId)
      .eq("loan_option_id", previousLoan.id)
      .order("applied_at", { ascending: false })
      .limit(1);

    if (loansError) throw loansError;

    // No application for previous loan = locked
    if (!userLoans || userLoans.length === 0) {
      return {
        loanId,
        isUnlocked: false,
        reason: `Complete ${previousLoan.type} loan first to unlock`,
        requiredLoanType: previousLoan.type,
      };
    }

    const previousLoanApplication = userLoans[0];

    // Check if previous loan is completed
    if (previousLoanApplication.status === "completed") {
      return {
        loanId,
        isUnlocked: true,
        reason: `Unlocked after completing ${previousLoan.type}`,
      };
    }

    // Previous loan exists but not completed
    if (previousLoanApplication.status === "disbursed") {
      return {
        loanId,
        isUnlocked: false,
        reason: `Complete your active ${previousLoan.type} loan first`,
        requiredLoanType: previousLoan.type,
      };
    }

    if (
      previousLoanApplication.status === "pending" ||
      previousLoanApplication.status === "approved"
    ) {
      return {
        loanId,
        isUnlocked: false,
        reason: `${previousLoan.type} loan is still being processed`,
        requiredLoanType: previousLoan.type,
      };
    }

    if (previousLoanApplication.status === "rejected") {
      return {
        loanId,
        isUnlocked: false,
        reason: `Previous ${previousLoan.type} loan was rejected. Please reapply.`,
        requiredLoanType: previousLoan.type,
      };
    }

    // Default: locked
    return {
      loanId,
      isUnlocked: false,
      reason: `Complete ${previousLoan.type} loan to unlock this`,
      requiredLoanType: previousLoan.type,
    };
  } catch (error) {
    console.error("Error checking loan unlock status:", error);
    return {
      loanId,
      isUnlocked: false,
      reason: "Error checking loan status. Please try again.",
    };
  }
}

/**
 * Get unlock status for all loans
 * @param userId - The user's ID
 * @param loans - Array of loan options
 * @returns Map of loan IDs to unlock status
 */
export async function getAllLoansUnlockStatus(
  userId: string,
  loans: any[]
): Promise<Map<string, LoanUnlockStatus>> {
  const unlockStatusMap = new Map<string, LoanUnlockStatus>();

  for (const loan of loans) {
    const status = await checkLoanUnlockStatus(
      userId,
      loan.id,
      loan.sort_order
    );
    unlockStatusMap.set(loan.id, status);
  }

  return unlockStatusMap;
}
