"use client";

import React, { useState, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Head from "next/head";

interface SuccessNotificationProps {
  message: string;
  onClose: () => void;
}

// Auth service for password reset
const authService = {
  updatePassword: async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Update password error:", error);
      return { success: false, error: (error as Error).message };
    }
  },

  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Sign out error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
};

const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [isValidSession, setIsValidSession] = useState<boolean>(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Check if user has valid session from reset email
  useEffect(() => {
    const checkSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error || !session) {
          setError(
            "Invalid or expired reset link. Please request a new password reset."
          );
          return;
        }

        setIsValidSession(true);
      } catch (error) {
        console.error("Session check error:", error);
        setError("Unable to verify reset link. Please try again.");
      }
    };

    checkSession();
  }, []);

  // Success notification component
  const SuccessNotification: React.FC<SuccessNotificationProps> = ({
    message,
    onClose,
  }) => {
    useEffect(() => {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);

      return () => clearTimeout(timer);
    }, [onClose]);

    return (
      <div className="fixed top-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50 flex items-center space-x-2 max-w-md">
        <CheckCircle className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm">{message}</span>
        <button
          onClick={onClose}
          className="ml-2 text-white hover:text-gray-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const validateForm = (): boolean => {
    if (!password) {
      setError("Password is required");
      return false;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return false;
    }

    if (!confirmPassword) {
      setError("Please confirm your password");
      return false;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    return true;
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  const handleConfirmPasswordChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfirmPassword(e.target.value);
    if (error) setError("");
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await authService.updatePassword(password);

      if (result.success) {
        setSuccessMessage(
          "Password updated successfully! Redirecting to login..."
        );
        setShowSuccess(true);

        // Clear form
        setPassword("");
        setConfirmPassword("");

        setTimeout(async () => {
          await authService.signOut();
          router.push("/login");
        }, 2000);
      } else {
        setError(
          result.error || "Failed to update password. Please try again."
        );
      }
    } catch (error) {
      console.error("Reset password error:", error);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const goToLogin = () => {
    router.push("/login");
  };

  const isFormValid = password.length >= 8 && password === confirmPassword;

  // Show error state if session is invalid
  if (!isValidSession && error) {
    return (
      <>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-8 text-center">
            {/* Logo */}
            <div className="flex items-center justify-center mb-8">
              <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center mr-3">
                <img src="logo.jpg" alt="logo" />
              </div>
              <span className="text-2xl font-semibold text-gray-800">
                Balaji Finance
              </span>
            </div>

            <div className="mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <X className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-xl font-semibold text-gray-800 mb-2">
                Invalid Reset Link
              </h1>
              <p className="text-gray-600 text-sm mb-6">{error}</p>
            </div>

            <button
              onClick={goToLogin}
              className="w-full py-3 px-4 bg-yellow-400 text-gray-800 rounded-lg font-medium hover:bg-yellow-500 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </main>
      </>
    );
  }

  // Show loading state while checking session
  if (!isValidSession) {
    return (
      <>
        <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
            <p className="text-gray-600">Verifying reset link...</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {showSuccess && (
        <SuccessNotification
          message={successMessage}
          onClose={() => setShowSuccess(false)}
        />
      )}

      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-8">
          {/* Logo */}
          <div className="flex items-center mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center mr-3">
              <img src="logo.jpg" alt="logo" />
            </div>
            <span className="text-2xl font-semibold text-gray-800">
              Balaji Finance
            </span>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-3xl text-gray-800 mb-2 font-light">
              Reset Password
            </h1>
            <p className="text-gray-600 text-sm">
              Enter your new password below
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* New Password */}
            <div>
              <label className="block text-gray-500 text-base mb-3">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-4 pr-12 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Enter your new password"
                  aria-label="New password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-yellow-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {password && password.length > 0 && password.length < 8 && (
                <p className="text-yellow-600 text-xs mt-1">
                  Password must be at least 8 characters
                </p>
              )}
              {password && password.length >= 8 && (
                <p className="text-green-600 text-xs mt-1">
                  ✓ Password length is valid
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-gray-500 text-base mb-3">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  className="w-full px-4 py-4 pr-12 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400 transition-colors"
                  placeholder="Confirm your new password"
                  aria-label="Confirm new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-yellow-600 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {confirmPassword && password && confirmPassword !== password && (
                <p className="text-red-500 text-xs mt-1">
                  Passwords do not match
                </p>
              )}
              {confirmPassword &&
                password &&
                confirmPassword === password &&
                password.length >= 8 && (
                  <p className="text-green-600 text-xs mt-1">
                    ✓ Passwords match
                  </p>
                )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Back to Login Link */}
            <div className="text-center">
              <button
                type="button"
                onClick={goToLogin}
                className="text-yellow-400 hover:text-yellow-500 text-sm transition-colors"
              >
                ← Back to Login
              </button>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || isLoading}
              className={`w-full py-4 rounded-full text-base font-medium transition-all duration-200 ${
                isFormValid && !isLoading
                  ? "bg-yellow-400 text-gray-800 hover:bg-yellow-500 cursor-pointer shadow-lg hover:shadow-xl"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-gray-800 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Updating Password...
                </div>
              ) : (
                "Update Password"
              )}
            </button>

            {/* Security Notice */}
            <div className="mt-4 text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">
                🔒 Your password is encrypted and secure
              </p>
              <p className="text-xs text-gray-500">
                Choose a strong password with at least 8 characters
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default ResetPasswordPage;
