// app/profile/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { User, ArrowLeft, Save, Mail } from "lucide-react";

interface UserData {
  id: string;
  name: string;
  age: number;
  email: string;
  mobile_number: string;
  referral: string;
  created_at: string;
  updated_at: string;
  auth_user_id: string;
  can_login: boolean;
  is_agent: boolean;
  purchased_courses: string[];
}

interface FormData {
  name: string;
  age: number;
  mobile_number: string;
}

const ProfileSection: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    age: 18,
    mobile_number: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Get current user from Supabase Auth
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setUser(session?.user || null);

        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setIsLoading(false);
          // Redirect to login if no user found
          router.push("/login");
        }
      } catch (error) {
        console.error("Error getting current user:", error);
        setIsLoading(false);
      }
    };

    getCurrentUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  // Fetch user profile from users table
  const fetchUserProfile = async (userId: string) => {
    try {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", userId)
        .single();

      if (error) {
        console.error("Error fetching user profile:", error);

        // If user doesn't exist in users table, create a new profile
        if (error.code === "PGRST116") {
          await createUserProfile(userId);
          return;
        }

        throw error;
      }

      if (data) {
        setUserData(data);
        setFormData({
          name: data.name || "",
          age: data.age || 18,
          mobile_number: data.mobile_number || "",
        });
      }
    } catch (error) {
      console.error("Error in fetchUserProfile:", error);
      setMessage({ type: "error", text: "Failed to load user profile" });
    } finally {
      setIsLoading(false);
    }
  };

  // Create new user profile if it doesn't exist
  const createUserProfile = async (userId: string) => {
    try {
      const { data: authData } = await supabase.auth.getUser();

      const newUserProfile = {
        auth_user_id: userId,
        name: authData.user?.user_metadata?.full_name || "User",
        email: authData.user?.email || "",
        age: 18,
        mobile_number: "",
        referral: "",
        can_login: true,
        is_agent: false,
        purchased_courses: [],
      };

      const { data, error } = await supabase
        .from("users")
        .insert([newUserProfile])
        .select()
        .single();

      if (error) throw error;

      setUserData(data);
      setFormData({
        name: data.name || "",
        age: data.age || 18,
        mobile_number: data.mobile_number || "",
      });
    } catch (error) {
      console.error("Error creating user profile:", error);
      setMessage({ type: "error", text: "Failed to create user profile" });
    }
  };

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleUpdateProfile = async () => {
    if (!user || !userData) {
      setMessage({
        type: "error",
        text: "User not found. Please log in again.",
      });
      return;
    }

    setIsUpdating(true);
    setMessage(null);

    // Validation
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "Name is required" });
      setIsUpdating(false);
      return;
    }

    if (formData.age < 18 || formData.age > 100) {
      setMessage({ type: "error", text: "Age must be between 18 and 100" });
      setIsUpdating(false);
      return;
    }

    if (!formData.mobile_number.match(/^[6-9][0-9]{9}$/)) {
      setMessage({ type: "error", text: "Invalid mobile number format" });
      setIsUpdating(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: formData.name.trim(),
          age: formData.age,
          mobile_number: formData.mobile_number,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userData.id);

      if (error) throw error;

      // Update local state
      setUserData((prev) =>
        prev
          ? {
              ...prev,
              name: formData.name.trim(),
              age: formData.age,
              mobile_number: formData.mobile_number,
              updated_at: new Date().toISOString(),
            }
          : null
      );

      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setIsUpdating(false);
    }
  };

  const calculateDateOfBirth = (age: number): string => {
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - age;
    return `${birthYear}`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  // If no user found
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            Please log in to view your profile
          </p>
          <button
            onClick={() => router.push("/login")}
            className="bg-yellow-400 text-gray-800 px-6 py-2 rounded-lg font-medium"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">Profile</h1>
        </div>
      </div>

      <div className="flex justify-center p-4 md:p-6">
        <div className="bg-white rounded-lg shadow-sm p-6 w-full max-w-7xl">
          <h2 className="text-lg font-bold text-gray-800 mb-6">
            Account Details
          </h2>

          {message && (
            <div
              className={`p-3 rounded-lg mb-4 ${
                message.type === "success"
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-red-50 text-red-600 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="space-y-6">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                placeholder="Enter your full name"
              />
            </div>

            {/* Age Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Age
              </label>
              <input
                type="number"
                min="18"
                max="100"
                value={formData.age}
                onChange={(e) =>
                  handleInputChange("age", parseInt(e.target.value) || 18)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Approximate birth year: {calculateDateOfBirth(formData.age)}
              </p>
            </div>

            {/* Mobile Number Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mobile Number
              </label>
              <input
                type="tel"
                value={formData.mobile_number}
                onChange={(e) =>
                  handleInputChange("mobile_number", e.target.value)
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                placeholder="Enter 10-digit mobile number"
                maxLength={10}
              />
              <p className="text-xs text-gray-500 mt-1">
                Must start with 6, 7, 8, or 9 and be 10 digits long
              </p>
            </div>

            {/* Email Field (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">
                  {user?.email || userData?.email || "No email found"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Email cannot be changed
              </p>
            </div>

            {/* User ID Field (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User ID
              </label>
              <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                <span className="text-gray-600 text-sm font-mono">
                  {userData?.id || "Not available"}
                </span>
              </div>
            </div>

            {/* Update Button */}
            <div className="pt-4">
              <button
                onClick={handleUpdateProfile}
                disabled={isUpdating}
                className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 text-gray-800 font-medium px-6 py-2 rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                {isUpdating ? "Updating..." : "Update Profile"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSection;
