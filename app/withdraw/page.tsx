"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  Smartphone,
  Building,
} from "lucide-react";

interface WithdrawalRequest {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  requested_at: string;
  rejection_reason?: string;
}

export default function WithdrawPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [withdrawalHistory, setWithdrawalHistory] = useState<
    WithdrawalRequest[]
  >([]);

  // Form state
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "bank_transfer" | "upi" | "paytm"
  >("upi");
  const [bankDetails, setBankDetails] = useState({
    account_name: "",
    account_number: "",
    ifsc_code: "",
    bank_name: "",
  });
  const [upiId, setUpiId] = useState("");
  const [paytmNumber, setPaytmNumber] = useState("");

  const MIN_WITHDRAWAL = 500;

  useEffect(() => {
    loadWithdrawalData();
  }, []);

  const loadWithdrawalData = async () => {
    try {
      setLoading(true);

      // Get current user
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      // Get user's internal ID
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) return;

      // Get agent data
      const { data: agentData } = await supabase
        .from("agents")
        .select("id")
        .eq("user_id", userData.id)
        .single();

      if (!agentData) {
        alert("You are not registered as an agent");
        router.push("/");
        return;
      }

      setAgentId(agentData.id);

      // Calculate available balance (paid commissions only)
      const { data: paidCommissions } = await supabase
        .from("commissions")
        .select("commission_amount")
        .eq("agent_id", agentData.id)
        .eq("status", "paid");

      const totalPaid =
        paidCommissions?.reduce(
          (sum, c) => sum + Number(c.commission_amount),
          0
        ) || 0;

      // Get total already withdrawn
      const { data: completedWithdrawals } = await supabase
        .from("withdrawal_requests")
        .select("amount")
        .eq("agent_id", agentData.id)
        .eq("status", "completed");

      const totalWithdrawn =
        completedWithdrawals?.reduce((sum, w) => sum + Number(w.amount), 0) ||
        0;

      // Get pending withdrawals
      const { data: pendingReqs } = await supabase
        .from("withdrawal_requests")
        .select("amount")
        .eq("agent_id", agentData.id)
        .in("status", ["pending", "approved"]);

      const totalPending =
        pendingReqs?.reduce((sum, w) => sum + Number(w.amount), 0) || 0;

      setAvailableBalance(totalPaid - totalWithdrawn - totalPending);
      setPendingWithdrawals(totalPending);

      // Load withdrawal history
      const { data: history } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("agent_id", agentData.id)
        .order("requested_at", { ascending: false })
        .limit(10);

      setWithdrawalHistory(history || []);
    } catch (error) {
      console.error("Error loading withdrawal data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agentId) return;

    const withdrawAmount = parseFloat(amount);

    // Validation
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    if (withdrawAmount < MIN_WITHDRAWAL) {
      alert(`Minimum withdrawal amount is ₹${MIN_WITHDRAWAL}`);
      return;
    }

    if (withdrawAmount > availableBalance) {
      alert("Insufficient balance");
      return;
    }

    // Validate payment details
    let paymentDetails: any = {};

    if (paymentMethod === "bank_transfer") {
      if (
        !bankDetails.account_name ||
        !bankDetails.account_number ||
        !bankDetails.ifsc_code ||
        !bankDetails.bank_name
      ) {
        alert("Please fill in all bank details");
        return;
      }
      paymentDetails = bankDetails;
    } else if (paymentMethod === "upi") {
      if (!upiId) {
        alert("Please enter UPI ID");
        return;
      }
      paymentDetails = { upi_id: upiId };
    } else if (paymentMethod === "paytm") {
      if (!paytmNumber) {
        alert("Please enter Paytm number");
        return;
      }
      paymentDetails = { paytm_number: paytmNumber };
    }

    try {
      setSubmitting(true);

      const { error } = await supabase.from("withdrawal_requests").insert({
        agent_id: agentId,
        amount: withdrawAmount,
        payment_method: paymentMethod,
        payment_details: paymentDetails,
        status: "pending",
      });

      if (error) throw error;

      alert("Withdrawal request submitted successfully!");

      // Reset form
      setAmount("");
      setBankDetails({
        account_name: "",
        account_number: "",
        ifsc_code: "",
        bank_name: "",
      });
      setUpiId("");
      setPaytmNumber("");

      // Reload data
      loadWithdrawalData();
    } catch (error) {
      console.error("Withdrawal request error:", error);
      alert("Failed to submit withdrawal request");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Withdraw Earnings
              </h1>
            </div>
          </div>

          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-white/80" />
                <p className="text-sm text-white/80">Available Balance</p>
              </div>
              <p className="text-3xl font-bold text-white">
                ₹{availableBalance.toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-white/60 mt-1">
                From paid commissions
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-white/80" />
                <p className="text-sm text-white/80">Pending Withdrawals</p>
              </div>
              <p className="text-3xl font-bold text-yellow-400">
                ₹{pendingWithdrawals.toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-white/60 mt-1">Being processed</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Important Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">
                Payment Processing Time
              </p>
              <p className="text-sm text-blue-700">
                Your withdrawal will be credited within{" "}
                <strong>7 days (1 week)</strong> after your request is approved
                by admin. Only paid commissions can be withdrawn.
              </p>
            </div>
          </div>
        </div>

        {/* Withdrawal Form */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Request Withdrawal
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Withdrawal Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  ₹
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={MIN_WITHDRAWAL}
                  max={availableBalance}
                  step="0.01"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Payment Method
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("upi")}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    paymentMethod === "upi"
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Smartphone className="w-6 h-6 text-blue-600 mb-2" />
                  <p className="font-medium text-gray-900">UPI</p>
                  <p className="text-xs text-gray-500">Google Pay, PhonePe</p>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    paymentMethod === "bank_transfer"
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Building className="w-6 h-6 text-blue-600 mb-2" />
                  <p className="font-medium text-gray-900">Bank Transfer</p>
                  <p className="text-xs text-gray-500">NEFT/IMPS/RTGS</p>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("paytm")}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    paymentMethod === "paytm"
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-blue-600 mb-2" />
                  <p className="font-medium text-gray-900">Paytm</p>
                  <p className="text-xs text-gray-500">Paytm Wallet</p>
                </button>
              </div>
            </div>

            {/* Payment Details */}
            {paymentMethod === "bank_transfer" && (
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900">Bank Details</h3>
                <input
                  type="text"
                  placeholder="Account Holder Name"
                  value={bankDetails.account_name}
                  onChange={(e) =>
                    setBankDetails({
                      ...bankDetails,
                      account_name: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Account Number"
                  value={bankDetails.account_number}
                  onChange={(e) =>
                    setBankDetails({
                      ...bankDetails,
                      account_number: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={bankDetails.ifsc_code}
                  onChange={(e) =>
                    setBankDetails({
                      ...bankDetails,
                      ifsc_code: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Bank Name"
                  value={bankDetails.bank_name}
                  onChange={(e) =>
                    setBankDetails({
                      ...bankDetails,
                      bank_name: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            )}

            {paymentMethod === "upi" && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">UPI Details</h3>
                <input
                  type="text"
                  placeholder="UPI ID (example@upi)"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            )}

            {paymentMethod === "paytm" && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-3">
                  Paytm Details
                </h3>
                <input
                  type="tel"
                  placeholder="Paytm Mobile Number"
                  value={paytmNumber}
                  onChange={(e) => setPaytmNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  maxLength={10}
                  required
                />
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || availableBalance < MIN_WITHDRAWAL}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <DollarSign className="w-5 h-5" />
                  Request Withdrawal
                </>
              )}
            </button>
          </form>
        </div>

        {/* Withdrawal History */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Withdrawal History
          </h2>

          {withdrawalHistory.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No withdrawal requests yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawalHistory.map((req: WithdrawalRequest) => (
                <div
                  key={req.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-900">
                        ₹{Number(req.amount).toLocaleString("en-IN")}
                      </p>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          req.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : req.status === "approved"
                            ? "bg-blue-100 text-blue-700"
                            : req.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(req.requested_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600">
                    Via {req.payment_method.replace("_", " ").toUpperCase()}
                  </p>
                  {req.rejection_reason && (
                    <p className="text-xs text-red-600 mt-2">
                      Reason: {req.rejection_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
