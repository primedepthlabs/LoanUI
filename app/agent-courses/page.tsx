"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, BookOpen, CheckCircle, Clock } from "lucide-react";

interface Course {
  id: string;
  plan_name: string;
  plan_name_hindi: string | null;
  amount: number;
  features: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  isPurchased: boolean;
}

const AgentCoursesPage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string>("");
  const [realtimeNotification, setRealtimeNotification] = useState<string>("");
  // 🔥 NEW: Referral code states
  const [referralCode, setReferralCode] = useState<string>("");
  const [sponsorInfo, setSponsorInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [showAllPlans, setShowAllPlans] = useState(true); // Show all plans by default

  useEffect(() => {
    const initializePage = async () => {
      try {
        await checkAuth();
        await fetchCourses();
      } catch (err) {
        console.error("Initialization error:", err);
        setError("Failed to load courses");
      } finally {
        setIsLoading(false);
      }
    };

    initializePage();

    // Setup real-time subscription
    const channel = supabase
      .channel("plans_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plans" },
        (payload) => {
          handleRealtimeUpdate(payload);
        }
      )
      .subscribe((status) => {
        console.log("Real-time subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const transformCourseData = (data: any): Course => {
    return {
      id: data.id,
      plan_name: data.plan_name || "Untitled Plan",
      plan_name_hindi: data.plan_name_hindi || null,
      amount: Number(data.amount) || 0,
      features: Array.isArray(data.features) ? data.features : [],
      is_active: data.is_active !== false,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
      isPurchased: false,
    };
  };

  const handleRealtimeUpdate = (payload: any) => {
    try {
      if (payload.eventType === "INSERT" && payload.new.is_active) {
        const newCourse: Course = transformCourseData(payload.new);
        setCourses((prev) => [...prev, newCourse]);
        setRealtimeNotification("New plan available");
        setTimeout(() => setRealtimeNotification(""), 3000);
      } else if (payload.eventType === "UPDATE") {
        if (payload.new.is_active) {
          setCourses((prev) => {
            const exists = prev.some((c) => c.id === payload.new.id);
            if (exists) {
              setRealtimeNotification("Plan updated");
              setTimeout(() => setRealtimeNotification(""), 3000);
              return prev.map((course) =>
                course.id === payload.new.id
                  ? {
                      ...transformCourseData(payload.new),
                      isPurchased: course.isPurchased,
                    }
                  : course
              );
            } else {
              setRealtimeNotification("New plan available");
              setTimeout(() => setRealtimeNotification(""), 3000);
              return [...prev, transformCourseData(payload.new)];
            }
          });
        } else {
          setCourses((prev) =>
            prev.filter((course) => course.id !== payload.new.id)
          );
          setRealtimeNotification("Plan removed");
          setTimeout(() => setRealtimeNotification(""), 3000);
        }
      } else if (payload.eventType === "DELETE") {
        setCourses((prev) =>
          prev.filter((course) => course.id !== payload.old.id)
        );
        setRealtimeNotification("Plan removed");
        setTimeout(() => setRealtimeNotification(""), 3000);
      }
    } catch (err) {
      console.error("Error handling real-time update:", err);
    }
  };

  const fetchCourses = async () => {
    try {
      setError("");

      const { data, error: fetchError } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("amount", { ascending: true });

      if (fetchError) {
        console.error("Supabase fetch error:", fetchError);
        throw fetchError;
      }

      if (!data || data.length === 0) {
        console.warn("No plans returned from database");
        setCourses([]);
        return;
      }

      const transformedCourses: Course[] = data
        .map((course) => {
          try {
            return transformCourseData(course);
          } catch (err) {
            console.error("Error transforming plan:", err, course);
            return null;
          }
        })
        .filter((course): course is Course => course !== null);

      setCourses(transformedCourses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      setError("Failed to load plans. Please refresh the page.");
    }
  };

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user || null);

      if (session?.user) {
        const { data } = await supabase
          .from("users")
          .select("purchased_courses")
          .eq("auth_user_id", session.user.id)
          .single();

        if (data?.purchased_courses) {
          setCourses((prevCourses) =>
            prevCourses.map((course) => ({
              ...course,
              isPurchased: data.purchased_courses.includes(course.id),
            }))
          );
        }
      }
    } catch (error) {
      console.error("Auth check error:", error);
    }
  };

  // 🔥 NEW: Validate referral code and fetch sponsor's plans
  const validateReferralCode = async () => {
    if (!referralCode.trim()) {
      setError("Please enter a referral code");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      // Step 1: Find sponsor by referral code
      const { data: sponsorAgent, error: sponsorError } = await supabase
        .from("agents")
        .select("id, user_id")
        .eq("referral_code", referralCode.trim())
        .single();

      if (sponsorError || !sponsorAgent) {
        setError("Invalid referral code. Please check and try again.");
        setSponsorInfo(null);
        setFilteredCourses([]);
        setShowAllPlans(true);
        setIsVerifying(false);
        return;
      }

      // Step 2: Get sponsor's name
      const { data: sponsorUser } = await supabase
        .from("users")
        .select("name")
        .eq("id", sponsorAgent.user_id)
        .single();

      setSponsorInfo({
        id: sponsorAgent.id,
        name: sponsorUser?.name || "Unknown",
      });

      // Step 3: Get sponsor's active plans
      const { data: sponsorPlans, error: plansError } = await supabase
        .from("agent_plans")
        .select("plan_id")
        .eq("agent_id", sponsorAgent.id)
        .eq("is_active", true);

      if (plansError) throw plansError;

      const sponsorPlanIds = sponsorPlans?.map((p) => p.plan_id) || [];

      if (sponsorPlanIds.length === 0) {
        setError(
          "Your sponsor hasn't purchased any plans yet. Please contact them."
        );
        setFilteredCourses([]);
        setShowAllPlans(true);
        setIsVerifying(false);
        return;
      }

      // Step 4: Filter courses to show only sponsor's plans
      const filtered = courses.filter((course) =>
        sponsorPlanIds.includes(course.id)
      );

      setFilteredCourses(filtered);
      setShowAllPlans(false);
      setError("");
    } catch (error) {
      console.error("Referral validation error:", error);
      setError("Failed to validate referral code. Please try again.");
      setSponsorInfo(null);
      setFilteredCourses([]);
      setShowAllPlans(true);
    } finally {
      setIsVerifying(false);
    }
  };

  // 🔥 NEW: Clear referral filter
  const clearReferralFilter = () => {
    setReferralCode("");
    setSponsorInfo(null);
    setFilteredCourses([]);
    setShowAllPlans(true);
    setError("");
  };
  const handleCourseSelect = (course: Course) => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (course.isPurchased) {
      router.push("/agent-dashboard");
    } else {
      // 🔥 NEW: Pass referral code to cart if sponsor is verified
      const cartUrl = sponsorInfo
        ? `/cart?plan=${course.id}&ref=${referralCode}`
        : `/cart?plan=${course.id}`;
      router.push(cartUrl);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-yellow-200 border-t-yellow-500 mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">Loading courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Real-time Notification */}
      {realtimeNotification && (
        <div className="fixed top-4 right-4 bg-yellow-500 text-gray-900 px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium">
          {realtimeNotification}
        </div>
      )}

      {/* Minimal Header */}
      <div className="border-b border-gray-100">
        <div className="max-w-8xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-1.5 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">Agent Courses</h1>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="max-w-8xl mx-auto px-4 py-3">
          <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              onClick={() => {
                setError("");
                setIsLoading(true);
                fetchCourses().finally(() => setIsLoading(false));
              }}
              className="ml-3 underline font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* 🔥 NEW: Referral Code Input Section */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Enter Referral Code
            </h3>

            {!sponsorInfo ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) =>
                    setReferralCode(e.target.value.toUpperCase())
                  }
                  placeholder="Enter 8-digit referral code"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-sm"
                  maxLength={8}
                  disabled={isVerifying}
                />
                <button
                  onClick={validateReferralCode}
                  disabled={isVerifying || !referralCode.trim()}
                  className="px-6 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-gray-900 text-sm font-medium rounded-lg transition-colors"
                >
                  {isVerifying ? "Verifying..." : "Verify"}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-green-900">
                    ✓ Showing plans from:{" "}
                    <span className="font-bold">{sponsorInfo.name}</span>
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Displaying {filteredCourses.length} available plan
                    {filteredCourses.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={clearReferralFilter}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white rounded transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2">
              💡 Enter your sponsor's referral code to see available plans
            </p>
          </div>
        </div>
      </div>
      {/* Compact Hero */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 py-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Become a Certified Loan Agent
          </h2>
        </div>
      </div>

      {/* Compact Courses Grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {(showAllPlans ? courses : filteredCourses).length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium mb-1">No plans available</p>
            <p className="text-gray-500 text-sm mb-4">
              Check back soon for new courses
            </p>
            <button
              onClick={() => {
                setIsLoading(true);
                fetchCourses().finally(() => setIsLoading(false));
              }}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 text-sm font-medium rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(showAllPlans ? courses : filteredCourses).map((course) => (
              <div
                key={course.id}
                className="border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all duration-200 overflow-hidden bg-white"
              >
                {/* Compact Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="mb-3">
                    <h3 className="font-semibold text-gray-900 text-base mb-1">
                      {course.plan_name}
                    </h3>
                    {course.plan_name_hindi && (
                      <p className="text-xs text-gray-500">
                        {course.plan_name_hindi}
                      </p>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-5">
                  {/* Compact Pricing */}
                  <div className="mb-5">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-2xl font-semibold text-gray-900">
                        ₹{course.amount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Minimal Features */}
                  <div className="mb-5">
                    <ul className="space-y-2">
                      {course.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm text-gray-600"
                        >
                          <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Minimal CTA */}
                  <button
                    onClick={() => handleCourseSelect(course)}
                    className="w-full py-2.5 px-4 bg-yellow-500 hover:bg-yellow-600 cursor-pointer text-gray-900 text-sm font-medium rounded-lg transition-colors"
                  >
                    {course.isPurchased ? "Access Course" : "Enroll Now"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentCoursesPage;
