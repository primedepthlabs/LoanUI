// app/loan-history/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Filter,
  Search,
  ChevronDown,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Download,
  Eye,
} from "lucide-react";

interface LoanApplication {
  id: string;
  loan_type: string;
  loan_amount: number;
  tenure: number;
  tenure_unit: string;
  disbursement_interest: number;
  repayment_interest: number;
  payment_type: "weekly" | "monthly";
  installment_amount: number;
  last_installment_amount: number | null;
  total_payable: number;
  total_interest: number;
  status: string;
  applied_at: string;
  approved_at: string | null;
  disbursed_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

interface LoanWithProgress extends LoanApplication {
  totalPaid: number;
  totalRemaining: number;
  progressPercentage: number;
  nextDueDate: string | null;
  paidEmis: number;
  totalEmis: number;
}

type LoanStatus = "all" | "active" | "completed" | "rejected" | "pending";
type SortOption = "newest" | "oldest" | "amount-high" | "amount-low";

const LoanHistory: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loans, setLoans] = useState<LoanWithProgress[]>([]);
  const [filteredLoans, setFilteredLoans] = useState<LoanWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LoanStatus>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAllLoans();
    }
  }, [user]);

  useEffect(() => {
    filterAndSortLoans();
  }, [loans, searchTerm, statusFilter, sortOption]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);
    } catch (error) {
      console.error("Auth check error:", error);
      router.push("/login");
    }
  };

  const fetchAllLoans = async () => {
    try {
      setIsLoading(true);

      // Fetch all loan applications for the user
      const { data: loanApplications, error: loansError } = await supabase
        .from("loan_applications")
        .select("*")
        .eq("user_id", user.id)
        .order("applied_at", { ascending: false });

      if (loansError) throw loansError;

      if (!loanApplications || loanApplications.length === 0) {
        setLoans([]);
        return;
      }

      // Get all loan IDs
      const loanIds = loanApplications.map((loan) => loan.id);

      // Fetch EMIs for all loans
      const { data: emis, error: emisError } = await supabase
        .from("loan_emis")
        .select("*")
        .in("loan_application_id", loanIds)
        .order("emi_number", { ascending: true });

      if (emisError) throw emisError;

      // Calculate progress for each loan
      const loansWithProgress: LoanWithProgress[] = loanApplications.map(
        (loan) => {
          const loanEmis =
            emis?.filter((emi) => emi.loan_application_id === loan.id) || [];

          const totalPaid = loanEmis.reduce(
            (sum, emi) => sum + emi.paid_amount,
            0
          );
          const totalRemaining =
            loan.status === "disbursed" ? loan.total_payable - totalPaid : 0;
          const progressPercentage =
            loan.total_payable > 0 ? (totalPaid / loan.total_payable) * 100 : 0;

          // Count paid EMIs
          const paidEmis = loanEmis.filter(
            (emi) => emi.status === "paid"
          ).length;
          const totalEmis = loanEmis.length;

          // Find next unpaid EMI
          const nextUnpaidEmi = loanEmis.find(
            (emi) =>
              emi.status === "pending" ||
              emi.status === "overdue" ||
              emi.status === "partial"
          );
          const nextDueDate = nextUnpaidEmi?.due_date || null;

          return {
            ...loan,
            totalPaid,
            totalRemaining,
            progressPercentage,
            nextDueDate,
            paidEmis,
            totalEmis,
          };
        }
      );

      setLoans(loansWithProgress);
    } catch (error) {
      console.error("Error fetching loans:", error);
      setLoans([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortLoans = () => {
    let filtered = [...loans];

    // Apply status filter
    if (statusFilter !== "all") {
      if (statusFilter === "active") {
        filtered = filtered.filter((loan) => loan.status === "disbursed");
      } else if (statusFilter === "completed") {
        filtered = filtered.filter((loan) => loan.status === "completed");
      } else if (statusFilter === "rejected") {
        filtered = filtered.filter((loan) => loan.status === "rejected");
      } else if (statusFilter === "pending") {
        filtered = filtered.filter(
          (loan) => loan.status === "pending" || loan.status === "approved"
        );
      }
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (loan) =>
          loan.loan_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
          loan.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortOption) {
        case "newest":
          return (
            new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
          );
        case "oldest":
          return (
            new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime()
          );
        case "amount-high":
          return b.loan_amount - a.loan_amount;
        case "amount-low":
          return a.loan_amount - b.loan_amount;
        default:
          return 0;
      }
    });

    setFilteredLoans(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      disbursed: {
        label: "Active",
        icon: Clock,
        className: "bg-yellow-100 text-yellow-700 border-yellow-200",
      },
      completed: {
        label: "Completed",
        icon: CheckCircle,
        className: "bg-green-100 text-green-700 border-green-200",
      },
      rejected: {
        label: "Rejected",
        icon: XCircle,
        className: "bg-red-100 text-red-700 border-red-200",
      },
      pending: {
        label: "Pending",
        icon: AlertCircle,
        className: "bg-gray-100 text-gray-700 border-gray-200",
      },
      approved: {
        label: "Approved",
        icon: CheckCircle,
        className: "bg-purple-100 text-purple-700 border-purple-200",
      },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const IconComponent = config.icon;

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${config.className}`}
      >
        <IconComponent className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount: number): string => {
    return `₹${amount.toLocaleString("en-IN")}`;
  };

  const handleViewDetails = (loanId: string) => {
    router.push(`/my-loan/${loanId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-yellow-200 border-t-yellow-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading loan history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Matching Dashboard Theme */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-sm">
        <div className="relative">
          <div className="absolute inset-0 opacity-10">
            <div
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              className="w-full h-full"
            />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">Loan History</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search and Filter Bar - Minimal */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search loans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent cursor-text"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as LoanStatus)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent cursor-pointer"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="amount-high">Highest Amount</option>
                <option value="amount-low">Lowest Amount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loans List */}
        {filteredLoans.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              No loans found
            </h3>
            <p className="text-gray-500">
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "You haven't applied for any loans yet"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Table Header - Minimal */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
              <div className="col-span-3">Loan</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-2">Tenure</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Progress</div>
              <div className="col-span-1 text-right">Action</div>
            </div>

            {/* Loan List Items */}
            <div className="divide-y divide-gray-100">
              {filteredLoans.map((loan) => {
                const isExpanded = expandedLoanId === loan.id;

                return (
                  <div
                    key={loan.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Main Row - Ultra compact for mobile */}
                    <div
                      className="px-3 py-2 lg:px-4 lg:py-3 cursor-pointer"
                      onClick={() =>
                        setExpandedLoanId(isExpanded ? null : loan.id)
                      }
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 items-center">
                        {/* Loan Details - Very compact on mobile */}
                        <div className="lg:col-span-3">
                          <div className="flex items-center justify-between lg:justify-start gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              <ChevronDown
                                className={`w-3 h-3 text-gray-400 transition-transform lg:hidden ${
                                  isExpanded ? "transform rotate-180" : ""
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-800 text-xs lg:text-sm truncate">
                                  {loan.loan_type}
                                </h3>
                                <p className="text-xs text-gray-500 lg:hidden">
                                  {formatDate(loan.applied_at)}
                                </p>
                              </div>
                            </div>
                            {/* Mobile: Status badge inline */}
                            <div className="lg:hidden">
                              {getStatusBadge(loan.status)}
                            </div>
                          </div>
                          {/* Desktop only date */}
                          <p className="hidden lg:block text-xs text-gray-500 mt-0.5">
                            {formatDate(loan.applied_at)}
                          </p>
                        </div>

                        {/* Amount - Show only on desktop in full, mobile shows in row below */}
                        <div className="hidden lg:block lg:col-span-2">
                          <div>
                            <p className="font-bold text-gray-800 text-sm">
                              {formatCurrency(loan.loan_amount)}
                            </p>
                            <p className="text-xs text-gray-500">
                              -{loan.disbursement_interest}% / +
                              {loan.repayment_interest}%
                            </p>
                            <p className="text-xs text-yellow-600 font-medium">
                              Total: {formatCurrency(loan.total_payable)}
                            </p>
                          </div>
                        </div>

                        {/* Tenure - Desktop only */}
                        <div className="hidden lg:block lg:col-span-2">
                          <div>
                            <p className="text-sm font-medium text-gray-800">
                              {loan.tenure}{" "}
                              {loan.payment_type === "weekly"
                                ? "Weeks"
                                : "Months"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {loan.payment_type === "weekly"
                                ? "Weekly"
                                : "Monthly"}
                            </p>
                          </div>
                        </div>

                        {/* Status - Desktop only (mobile shows inline above) */}
                        <div className="hidden lg:flex lg:col-span-2 items-center">
                          {getStatusBadge(loan.status)}
                        </div>

                        {/* Progress - Desktop only */}
                        <div className="hidden lg:block lg:col-span-2">
                          {(loan.status === "disbursed" ||
                            loan.status === "completed") && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-500">
                                  {loan.paidEmis}/{loan.totalEmis}
                                </span>
                                <span className="text-xs font-semibold text-gray-700">
                                  {Math.round(loan.progressPercentage)}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full transition-all ${
                                    loan.status === "completed"
                                      ? "bg-green-500"
                                      : "bg-yellow-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      loan.progressPercentage,
                                      100
                                    )}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions - Desktop only */}
                        <div className="hidden lg:flex lg:col-span-1 justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetails(loan.id);
                            }}
                            className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded transition-colors cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Mobile: Compact info row below header */}
                      <div className="flex items-center justify-between mt-1.5 lg:hidden text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-gray-800">
                            {formatCurrency(loan.loan_amount)}
                          </span>
                          <span className="text-gray-500">
                            {loan.tenure}{" "}
                            {loan.payment_type === "weekly" ? "wks" : "mon"}
                          </span>
                        </div>
                        {(loan.status === "disbursed" ||
                          loan.status === "completed") && (
                          <span className="text-gray-600 font-medium">
                            {Math.round(loan.progressPercentage)}% paid
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Details - Ultra Minimal Mobile */}
                    {isExpanded && (
                      <div className="px-3 pb-2 bg-gray-50 border-t border-gray-100 lg:hidden">
                        <div className="space-y-2 mt-2">
                          {/* Compact 2-column grid */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-gray-500">Disbursement</p>
                              <p className="font-semibold text-red-600">
                                -{loan.disbursement_interest}%
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Repayment</p>
                              <p className="font-semibold text-orange-600">
                                +{loan.repayment_interest}%
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Total Payable</p>
                              <p className="font-semibold text-yellow-600">
                                {formatCurrency(loan.total_payable)}
                              </p>
                            </div>

                            {(loan.status === "disbursed" ||
                              loan.status === "completed") && (
                              <>
                                <div>
                                  <p className="text-gray-500">Paid</p>
                                  <p className="font-semibold text-green-600">
                                    {formatCurrency(loan.totalPaid)}
                                  </p>
                                </div>
                                {loan.status === "disbursed" && (
                                  <div>
                                    <p className="text-gray-500">Remaining</p>
                                    <p className="font-semibold text-orange-600">
                                      {formatCurrency(loan.totalRemaining)}
                                    </p>
                                  </div>
                                )}
                              </>
                            )}

                            <div>
                              <p className="text-gray-500">EMI</p>
                              <p className="font-semibold text-gray-800">
                                {formatCurrency(loan.installment_amount)}
                              </p>
                            </div>

                            {loan.last_installment_amount &&
                              loan.last_installment_amount !==
                                loan.installment_amount && (
                                <div>
                                  <p className="text-gray-500">Last EMI</p>
                                  <p className="font-semibold text-yellow-600">
                                    {formatCurrency(
                                      loan.last_installment_amount
                                    )}
                                  </p>
                                </div>
                              )}

                            {(loan.status === "disbursed" ||
                              loan.status === "completed") && (
                              <div>
                                <p className="text-gray-500">Progress</p>
                                <p className="font-semibold text-gray-800">
                                  {loan.paidEmis}/{loan.totalEmis} EMIs
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Inline alerts */}
                          {loan.nextDueDate && loan.status === "disbursed" && (
                            <div className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">
                              Next: {formatDate(loan.nextDueDate)}
                            </div>
                          )}

                          {loan.status === "rejected" &&
                            loan.rejection_reason && (
                              <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                                {loan.rejection_reason}
                              </div>
                            )}

                          {loan.status === "completed" && loan.completed_at && (
                            <div className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                              Completed: {formatDate(loan.completed_at)}
                            </div>
                          )}

                          {/* Compact buttons */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewDetails(loan.id);
                              }}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-gray-900 text-xs rounded-lg cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanHistory;   