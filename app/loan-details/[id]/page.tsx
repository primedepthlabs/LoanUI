"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft } from "lucide-react";

interface LoanOption {
  id: string;
  type: string;
  type_hindi: string;
  amount: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
}

const LoanDetailsPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const loanId = params.id as string;

  const [loan, setLoan] = useState<LoanOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLoanDetails();
  }, [loanId]);

  const fetchLoanDetails = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("loan_options")
        .select("*")
        .eq("id", loanId)
        .single();

      if (error) throw error;
      setLoan(data);
    } catch (error) {
      console.error("Error fetching loan details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyNow = () => {
    router.push(`/loan-application/${loanId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">Loan not found</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 bg-yellow-400 text-gray-800 font-semibold rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="flex items-center gap-4 text-white">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center text-3xl">
            {loan.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{loan.type}</h1>
            <p className="text-gray-300">{loan.type_hindi}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-2xl mx-auto">
        {/* Amount */}
        <div className="bg-white rounded-lg p-6 mb-4 text-center">
          <p className="text-gray-600 text-sm mb-2">Loan Amount Up To</p>
          <p className="text-4xl font-bold text-gray-800">{loan.amount}</p>
        </div>

        {/* Features */}
        <div className="bg-white rounded-lg p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Features</h2>
          <ul className="space-y-2 text-gray-700">
            <li>• Interest Rate: From 10.5% per annum</li>
            <li>• Tenure: 12 to 60 months</li>
            <li>• Quick approval in 24-48 hours</li>
            <li>• Minimal documentation</li>
          </ul>
        </div>

        {/* Eligibility */}
        <div className="bg-white rounded-lg p-6 mb-4">
          <h2 className="font-bold text-gray-800 mb-3">Eligibility</h2>
          <ul className="space-y-2 text-gray-700">
            <li>• Age: 21 to 65 years</li>
            <li>• Monthly Income: Min ₹15,000</li>
            <li>• Valid KYC documents required</li>
          </ul>
        </div>

        {/* Apply Button */}
        <button
          onClick={handleApplyNow}
          className="w-full bg-yellow-400 text-gray-800 font-bold py-4 rounded-lg text-lg hover:bg-yellow-500 transition-colors"
        >
          Apply Now
        </button>
      </div>
    </div>
  );
};

export default LoanDetailsPage;
