"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  User,
  ArrowLeft,
  Save,
  Phone,
  Mail,
  Calendar,
  FileText,
  Share2,
  Menu,
  X,
} from "lucide-react";

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
}

interface FormData {
  name: string;
  age: number;
  mobile_number: string;
}

const ProfileSection: React.FC = () => {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    age: 18,
    mobile_number: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeSection, setActiveSection] = useState("account");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Fetch user data
  const fetchUserData = async () => {
    try {
      setIsLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("auth_user_id", session.user.id)
        .single();

      if (error) {
        console.error("Error fetching user data:", error);
        return;
      }

      if (data) {
        setUserData(data);
        setFormData({
          name: data.name,
          age: data.age,
          mobile_number: data.mobile_number,
        });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleUpdateProfile = async () => {
    if (!userData) return;

    try {
      setIsUpdating(true);
      setMessage(null);

      // Validation
      if (!formData.name.trim()) {
        setMessage({ type: "error", text: "Name is required" });
        return;
      }

      if (formData.age < 18 || formData.age > 100) {
        setMessage({ type: "error", text: "Age must be between 18 and 100" });
        return;
      }

      if (!formData.mobile_number.match(/^[6-9][0-9]{9}$/)) {
        setMessage({ type: "error", text: "Invalid mobile number format" });
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({
          name: formData.name.trim(),
          age: formData.age,
          mobile_number: formData.mobile_number,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userData.id);

      if (error) {
        setMessage({ type: "error", text: "Failed to update profile" });
        console.error("Update error:", error);
        return;
      }

      setMessage({ type: "success", text: "Profile updated successfully!" });
      await fetchUserData(); // Refresh data
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred" });
      console.error("Error:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const calculateDateOfBirth = (age: number): string => {
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - age;
    return `${birthYear}`;
  };

  const sidebarItems = [
    { id: "account", label: "Account Details", icon: User },
    { id: "referral", label: "Referral Program", icon: Share2 },
  ];

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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 cursor-pointer rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 " />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Profile</h1>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-sm min-h-screen">
          <div className="p-4">
            <div className="space-y-2">
              {sidebarItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer text-left transition-colors ${
                      activeSection === item.id
                        ? "bg-yellow-50 text-yellow-600 border border-yellow-200"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <IconComponent className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {activeSection === "account" && (
            <div className="bg-white rounded-lg shadow-sm p-6">
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
                    <span className="text-gray-600">{userData?.email}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Email cannot be changed
                  </p>
                </div>

                {/* Update Button */}
                <div className="pt-4">
                  <button
                    onClick={handleUpdateProfile}
                    disabled={isUpdating}
                    className="flex items-center gap-2 cursor-pointer bg-yellow-400 hover:bg-yellow-500 disabled:bg-gray-300 text-gray-800 font-medium px-6 py-2 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {isUpdating ? "Updating..." : "Update Profile"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "referral program" && (
            <div className="bg-red-50 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-6">
                Referral Program
              </h2>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileSection;
