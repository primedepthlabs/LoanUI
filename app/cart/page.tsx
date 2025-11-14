"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, CreditCard, Shield, CheckCircle } from "lucide-react";

type CourseDef = {
  id: string;
  title: string;
  price: number;
  cashback: number;
  duration: string;
};

const COURSES: Record<string, CourseDef> = {
  basic_agent: {
    id: "basic_agent",
    title: "Basic Agent Program",
    price: 2500,
    cashback: 625,
    duration: "4 weeks",
  },
  advanced_agent: {
    id: "advanced_agent",
    title: "Advanced Agent Program",
    price: 5200,
    cashback: 1300,
    duration: "6 weeks",
  },
};

export default function CartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams?.get("course") ?? "";
  const selectedCourse = courseId ? (COURSES[courseId] ?? null) : null;

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setAuthLoading(true);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const session = data?.session;
        setUser(session?.user ?? null);

        if (!session?.user) {
          // send to login so they come back to cart afterwards
          router.push(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setErrorMsg("Unable to verify session. Please refresh or log in again.");
      } finally {
        setAuthLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBack = () => router.back();

  if (!selectedCourse) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Course not found</p>
          <button
            onClick={() => router.push("/agent-courses")}
            className="bg-yellow-400 text-gray-800 px-6 py-2 rounded-lg font-medium"
          >
            Back to Courses
          </button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400" />
      </div>
    );
  }

  // ---------- Dummy immediate payment (no DB, no network) ----------
const handlePayment = () => {
  setErrorMsg(null);

  // If not logged in, send to login first (preserve returnTo so they come back)
  if (!user) {
    router.push(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
    return;
  }

  setIsProcessing(true);

  // small UX delay to show spinner then show success modal
  setTimeout(() => {
    setIsProcessing(false);
    setPaymentSuccess(true);

    // persist dummy purchase flag once
    try {
      localStorage.setItem("hasPurchasedCourse", "true");
    } catch (e) {
      console.warn("localStorage not available", e);
    }

    // After short pause so user sees success modal, navigate and replace history
    setTimeout(() => {
     router.replace("/firstview"); // use one consistent route
    }, 1200);
  }, 400); // keep small so it's instant-feeling but visible
};

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Checkout</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Order Summary */}
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Order Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{selectedCourse.title}</span>
                <span className="font-semibold">₹{selectedCourse.price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-green-600">
                <span>Cashback after completion</span>
                <span className="font-semibold">₹{selectedCourse.cashback.toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span>₹{selectedCourse.price.toLocaleString()}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Effective cost: ₹{(selectedCourse.price - selectedCourse.cashback).toLocaleString()} after cashback
                </p>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Method</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400">
                <input type="radio" name="payment" defaultChecked className="text-yellow-400" />
                <CreditCard className="w-5 h-5 text-gray-400" />
                <span className="flex-1">Credit/Debit Card</span>
              </label>

              <label className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400">
                <input type="radio" name="payment" className="text-yellow-400" />
                <span className="flex-1">UPI Payment</span>
              </label>

              <label className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400">
                <input type="radio" name="payment" className="text-yellow-400" />
                <span className="flex-1">Net Banking</span>
              </label>
            </div>
          </div>

          {/* Security Notice */}
          <div className="bg-blue-50 p-4 border-t border-blue-200">
            <div className="flex items-center gap-2 text-blue-700 text-sm">
              <Shield className="w-4 h-4" />
              <span>Your payment is secure and encrypted</span>
            </div>
          </div>

          {/* Errors */}
          {errorMsg && (
            <div className="p-4 text-red-700 bg-red-50 border-t border-red-100">
              {errorMsg}
            </div>
          )}

          {/* Pay Button */}
          <div className="p-6">
            <button
              onClick={handlePayment}
              disabled={isProcessing}
              className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 text-gray-800 font-bold py-4 rounded-lg text-lg transition-colors flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-800" />
                  Processing...
                </>
              ) : (
                `Pay ₹${selectedCourse.price.toLocaleString()}`
              )}
            </button>
          </div>
        </div>
      </div>

      {paymentSuccess && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center max-w-md">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment Successful!</h2>
            <p className="text-gray-600 mb-4">You have successfully enrolled in {selectedCourse.title}</p>
            <p className="text-green-600 font-medium mb-6">
              You will get ₹{selectedCourse.cashback.toLocaleString()} cashback after course completion
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
