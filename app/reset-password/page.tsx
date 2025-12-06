"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if user has a valid session (from reset email link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
      }
    });
  }, [router]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setMessage("✓ Password updated! Redirecting to login...");
      setIsSuccess(true);

      // Wait 3 seconds then go to login
      setTimeout(() => {
        supabase.auth.signOut();
        router.push("/login");
      }, 3000);
    } catch (error) {
      setMessage("Failed to reset password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <h1 className="text-3xl text-gray-800 mb-2 font-light">
            Reset Password
          </h1>
          <p className="text-gray-500">Enter your new password</p>
        </div>

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div>
            <label className="block text-gray-500 text-base mb-3">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-4 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400"
              placeholder="Enter new password"
              required
            />
          </div>

          <div>
            <label className="block text-gray-500 text-base mb-3">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-4 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400"
              placeholder="Confirm new password"
              required
            />
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg ${
                isSuccess
                  ? "bg-green-50 text-green-600"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password || !confirmPassword}
            className={`w-full py-4 rounded-full text-base font-medium ${
              password && confirmPassword && !isLoading
                ? "bg-yellow-400 text-gray-800 hover:bg-yellow-500"
                : "bg-gray-300 text-gray-500"
            }`}
          >
            {isLoading ? "Updating..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
