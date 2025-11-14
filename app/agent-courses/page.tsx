// app/agent-courses/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, BookOpen, TrendingUp, CheckCircle, Star } from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string;
  duration: string;
  level: string;
  price: number;
  original_price: number;
  cashback_percent: number;
  cashback_amount: number;
  icon: React.ReactNode;
  features: string[];
  isPurchased: boolean;
}

const AgentCoursesPage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const courses: Course[] = [
    {
      id: "basic_agent",
      title: "Basic Agent Program",
      description: "Start your journey as a loan agent with our comprehensive basic training program. Learn the fundamentals of loan processing and customer acquisition.",
      duration: "4 weeks",
      level: "Beginner",
      price: 2500,
      original_price: 3333,
      cashback_percent: 25,
      cashback_amount: 625,
      icon: <BookOpen className="w-6 h-6" />,
      features: [
        "Loan Processing Fundamentals",
        "Customer Acquisition Strategies",
        "Basic Documentation Training",
        "Commission Structure Overview",
        "Mobile App Access",
        "Certificate of Completion"
      ],
      isPurchased: false
    },
    {
      id: "advanced_agent",
      title: "Advanced Agent Program",
      description: "Master advanced sales techniques and portfolio management. Get access to premium tools and higher commission rates with our advanced program.",
      duration: "6 weeks",
      level: "Advanced",
      price: 5200,
      original_price: 6933,
      cashback_percent: 25,
      cashback_amount: 1300,
      icon: <TrendingUp className="w-6 h-6" />,
      features: [
        "Advanced Sales Techniques",
        "Portfolio Management",
        "Premium Customer Support",
        "Higher Commission Rates",
        "Advanced Analytics Dashboard",
        "Priority Lead Generation",
        "Mentorship Program",
        "Gold Certificate"
      ],
      isPurchased: false
    }
  ];

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      
      if (session?.user) {
        // Check if user has already purchased any courses
        const { data } = await supabase
          .from('users')
          .select('purchased_courses')
          .eq('auth_user_id', session.user.id)
          .single();

        if (data?.purchased_courses) {
          // Update courses with purchased status
          courses.forEach(course => {
            course.isPurchased = data.purchased_courses.includes(course.id);
          });
        }
      }
    } catch (error) {
      console.error("Auth check error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCourseSelect = (course: Course) => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (course.isPurchased) {
      // If already purchased, go to agent dashboard
      router.push("/agent-dashboard");
    } else {
      // Redirect to cart with course details
      router.push(`/cart?course=${course.id}`);
    }
  };

  const handleBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Become a Loan Agent</h1>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 p-6 text-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Start Your Journey as a Certified Loan Agent
          </h2>
          <p className="text-gray-700 mb-2">
            Earn attractive commissions while helping people achieve their financial goals
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            <div className="flex items-center gap-2 bg-white/30 px-3 py-1 rounded-full">
              <Star className="w-4 h-4 fill-current text-yellow-600" />
              <span className="text-sm font-medium">Flexible Hours</span>
            </div>
            <div className="flex items-center gap-2 bg-white/30 px-3 py-1 rounded-full">
              <Star className="w-4 h-4 fill-current text-yellow-600" />
              <span className="text-sm font-medium">High Commissions</span>
            </div>
            <div className="flex items-center gap-2 bg-white/30 px-3 py-1 rounded-full">
              <Star className="w-4 h-4 fill-current text-yellow-600" />
              <span className="text-sm font-medium">Training Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Courses Grid */}
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {courses.map((course) => (
            <div
              key={course.id}
              className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border-2 ${
                course.isPurchased ? 'border-green-300' : 'border-yellow-200'
              }`}
            >
              {/* Course Header */}
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 p-6 text-white">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-3 rounded-xl ${
                    course.isPurchased ? 'bg-green-500' : 'bg-yellow-500'
                  }`}>
                    {course.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{course.title}</h3>
                    <p className="text-gray-300 text-sm">{course.level} Level</p>
                  </div>
                </div>
                <p className="text-gray-300">{course.description}</p>
              </div>

              {/* Cashback Banner */}
              <div className="bg-green-50 border-b border-green-200 p-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                    {course.cashback_percent}% Cashback
                  </div>
                  <span className="text-green-700 text-sm font-medium">
                    Get ₹{course.cashback_amount} back after completion!
                  </span>
                </div>
              </div>

              {/* Course Details */}
              <div className="p-6">
                {/* Pricing */}
                <div className="mb-6">
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-3xl font-bold text-gray-800">
                      ₹{course.price.toLocaleString()}
                    </span>
                    <span className="text-lg text-gray-500 line-through">
                      ₹{course.original_price.toLocaleString()}
                    </span>
                    <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-sm font-medium">
                      Save ₹{(course.original_price - course.price).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-green-600 font-medium">
                    Effective price: ₹{(course.price - course.cashback_amount).toLocaleString()} after cashback
                  </p>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2 text-gray-600 mb-4">
                  <span className="text-sm">⏱️ {course.duration}</span>
                </div>

                {/* Features */}
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-800 mb-3">What's Included:</h4>
                  <ul className="space-y-2">
                    {course.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action Button */}
                <button
                  onClick={() => handleCourseSelect(course)}
                  className={`w-full py-3 px-4 rounded-lg font-bold transition-all duration-200 ${
                    course.isPurchased
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-yellow-400 hover:bg-yellow-500 text-gray-800 hover:shadow-lg"
                  }`}
                >
                  {course.isPurchased ? (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Go to Agent Dashboard
                    </span>
                  ) : (
                    `Enroll Now - ₹${course.price.toLocaleString()}`
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AgentCoursesPage;