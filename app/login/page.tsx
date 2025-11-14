"use client";
import { useState } from "react";
import Head from "next/head";
import { NextPage } from "next";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Service functions
const authService = {
  signIn: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });

      if (error) throw error;
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error("Sign in error:", error);
      return { success: false, error: (error as Error).message };
    }
  },

  resetPassword: async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Reset password error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
};

const userService = {
  getUserByAuthId: async (authUserId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, kyc_status, can_login")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (error) throw error;
      return { success: true, user: data };
    } catch (error) {
      console.error("Get user error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
};

const LoginPage: NextPage = () => {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isChecked, setIsChecked] = useState<boolean>(true);
  const [loginStatus, setLoginStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>("");
  const [isResettingPassword, setIsResettingPassword] =
    useState<boolean>(false);
  const [resetPasswordStatus, setResetPasswordStatus] = useState<string>("");
  const router = useRouter();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (loginStatus) setLoginStatus(""); // Clear error when user starts typing
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (loginStatus) setLoginStatus(""); // Clear error when user starts typing
  };

  const handleCheckboxChange = () => {
    setIsChecked(!isChecked);
  };

  const goToSignup = async () => {
    router.push("/signup");
  };

  const handleForgotPassword = async () => {
    if (!validateEmail(forgotPasswordEmail)) {
      setResetPasswordStatus("Please enter a valid email address");
      return;
    }

    setIsResettingPassword(true);
    setResetPasswordStatus("");

    try {
      const result = await authService.resetPassword(forgotPasswordEmail);

      if (result.success) {
        setResetPasswordStatus("Password reset link sent! Check your email.");
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotPasswordEmail("");
          setResetPasswordStatus("");
        }, 3000);
      } else {
        setResetPasswordStatus(
          result.error || "Failed to send reset email. Please try again."
        );
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      setResetPasswordStatus("Something went wrong. Please try again.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleContinue = async () => {
    if (!validateEmail(email)) {
      setLoginStatus("Please enter a valid email address");
      return;
    }

    if (password.length < 8) {
      setLoginStatus("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setLoginStatus("");

    try {
      // Authenticate user with Supabase
      const authResult = await authService.signIn(email, password);

      if (!authResult.success) {
        if (authResult.error?.includes("Invalid login credentials")) {
          setLoginStatus(
            "Invalid email or password. Please check your credentials."
          );
        } else if (authResult.error?.includes("Email not confirmed")) {
          setLoginStatus(
            "Please check your email and verify your account before signing in."
          );
        } else {
          setLoginStatus(authResult.error || "Login failed. Please try again.");
        }
        return;
      }

      const userId = authResult.user?.id;
      if (!userId) {
        setLoginStatus("Login failed. Please try again.");
        return;
      }

      // Get user data to check KYC status
      const userResult = await userService.getUserByAuthId(userId);

      if (!userResult.success || !userResult.user) {
        setLoginStatus("User data not found. Please contact support.");
        return;
      }

      // Check KYC status before allowing login
      const { kyc_status, can_login } = userResult.user as {
        kyc_status: string;
        can_login: boolean;
      };

      if (can_login || kyc_status === "approved") {
        router.push("/");
        return;
      }

      if (kyc_status === "pending" || kyc_status === "under_review") {
        setLoginStatus(
          "Your account is under review. Please wait for approval."
        );
        await supabase.auth.signOut();
      } else if (kyc_status === "rejected") {
        setLoginStatus(
          "Your account has been rejected. Please contact support."
        );
        await supabase.auth.signOut();
      } else {
        setLoginStatus("Please complete your KYC verification first.");
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginStatus("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = validateEmail(email) && password.length >= 8 && isChecked;

  return (
    <>
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">
                  Reset Password
                </h2>
                <button
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotPasswordEmail("");
                    setResetPasswordStatus("");
                  }}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <p className="text-gray-600 text-sm mb-4">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(e) => {
                      setForgotPasswordEmail(e.target.value);
                      if (resetPasswordStatus) setResetPasswordStatus("");
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400 transition-colors"
                    placeholder="Enter your email"
                  />
                </div>

                {/* Reset Status Message */}
                {resetPasswordStatus && (
                  <div
                    className={`p-3 rounded-lg ${
                      resetPasswordStatus.includes("sent") ||
                      resetPasswordStatus.includes("Check")
                        ? "bg-green-50 border border-green-200"
                        : "bg-red-50 border border-red-200"
                    }`}
                  >
                    <p
                      className={`text-sm ${
                        resetPasswordStatus.includes("sent") ||
                        resetPasswordStatus.includes("Check")
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {resetPasswordStatus}
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotPasswordEmail("");
                      setResetPasswordStatus("");
                    }}
                    className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleForgotPassword}
                    disabled={
                      !validateEmail(forgotPasswordEmail) || isResettingPassword
                    }
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      validateEmail(forgotPasswordEmail) && !isResettingPassword
                        ? "bg-yellow-400 text-gray-800 hover:bg-yellow-500"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {isResettingPassword ? (
                      <div className="flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin mr-2"></div>
                        Sending...
                      </div>
                    ) : (
                      "Send Reset Link"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white w-full max-w-md rounded-xl shadow-lg p-8">
          {/* Logo */}
          <div className="flex items-center mb-10">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center mr-3">
              <img src="logo.jpg" alt="logo" />
            </div>
            <span className="text-2xl font-semibold text-gray-800">
              Balaji Finance
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl text-gray-800 mb-10 font-light">Login</h1>

          {/* Form */}
          <div className="space-y-6">
            {/* Email Input */}
            <div>
              <label className="block text-gray-500 text-base mb-3">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400 transition-colors"
                placeholder="Enter your email"
                aria-label="Email address"
              />
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-gray-500 text-base mb-3">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-lg text-base focus:outline-none focus:border-yellow-400 transition-colors"
                placeholder="Enter your password"
                aria-label="Password"
              />
            </div>

            {/* Error Message */}
            {loginStatus && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm">{loginStatus}</p>
              </div>
            )}

            {/* Forgot Password Link */}
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setForgotPasswordEmail(email); // Pre-fill with current email
                }}
                className="text-yellow-400 hover:text-yellow-500 cursor-pointer text-sm transition-colors"
              >
                Forgot Password?
              </button>
            </div>

            {/* Signup Link */}
            <p className="flex gap-1 text-gray-500 justify-end">
              Don't have an account?
              <span
                onClick={goToSignup}
                className="text-yellow-400 cursor-pointer hover:text-yellow-500"
              >
                Sign up
              </span>
            </p>

            {/* Continue Button */}
            <button
              onClick={handleContinue}
              disabled={!isFormValid || isLoading}
              className={`w-full py-4 rounded-full text-base font-medium transition-all duration-200 ${
                isFormValid && !isLoading
                  ? "bg-yellow-400 text-gray-800 hover:bg-yellow-500 cursor-pointer"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-gray-800 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Signing in...
                </div>
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </div>
      </main>
    </>
  );
};

export default LoginPage;
