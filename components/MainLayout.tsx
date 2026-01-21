// components/MainLayout.tsx
"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("home");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  // Fetch user profile picture
  const fetchUserProfile = async (authUserId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("profile_picture_url")
        .eq("auth_user_id", authUserId)
        .single();

      if (data) {
        setProfilePicture(data.profile_picture_url || null);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };
  // Pages that should NOT show sidebar
  const noSidebarPages = ["/login", "/signup", "/reset-password"];
  const shouldShowSidebar = !noSidebarPages.includes(pathname);

  // Auth check
  useEffect(() => {
    let mounted = true;

    const checkAuthAndFlags = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchUserProfile(session.user.id);
        }
      } catch (err) {
        console.error("Auth check error:", err);
      } finally {
        if (mounted) {
          setIsCheckingAuth(false);
        }
      }
    };

    checkAuthAndFlags();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setProfilePicture(null);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);
  // ADD THIS NEW useEffect - PROTECTION LOGIC
  useEffect(() => {
    // Wait until auth check is complete
    if (isCheckingAuth) return;

    // If user is NOT logged in and trying to access protected pages
    if (!user && shouldShowSidebar) {
      router.push("/login");
    }
  }, [isCheckingAuth, user, shouldShowSidebar, router]);

  // Update active tab based on pathname
  useEffect(() => {
    if (pathname === "/") {
      setActiveTab("home");
    } else if (pathname.includes("/loan-history")) {
      setActiveTab("loan-history");
    } else if (pathname.includes("/agent-courses")) {
      setActiveTab("earn-agent");
    } else if (pathname.includes("/agent-dashboard")) {
      setActiveTab("agent-dashboard");
    } else if (pathname.includes("/agent-content")) {
      setActiveTab("agent-content");
    } else if (pathname.includes("/agent-network")) {
      setActiveTab("agent-network");
    }
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setActiveTab("home");
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleLoginSignup = () => router.push("/login");
  const handleProfileClick = () => router.push("/profile");

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);

    // Navigate to the corresponding page
    switch (tabId) {
      case "home":
        router.push("/");
        break;
      case "loan-history":
        router.push("/loan-history");
        break;
      case "earn-agent":
        router.push("/agent-courses");
        break;
      case "agent-dashboard":
        router.push("/agent-dashboard");
        break;
      case "agent-content":
        router.push("/agent-content");
        break;
      case "agent-network":
        router.push("/agent-network");
        break;
    }
  };

  // If it's a login/signup page, render without sidebar
  if (!shouldShowSidebar) {
    return <>{children}</>;
  }

  // Loading state
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Render with sidebar
  return (
    <div className="h-screen bg-gray-100 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        user={user}
        onLogout={handleLogout}
        onLoginSignup={handleLoginSignup}
        onProfileClick={handleProfileClick}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        profilePicture={profilePicture}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center overflow-hidden">
                {user && profilePicture ? (
                  <img
                    src={profilePicture}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-bold text-xs">SB</span>
                )}
              </div>
              <span className="font-bold text-gray-800">S.B Finance</span>
            </div>
            <div className="w-9" />
          </div>
        </div>
        <div className="flex-1 bg-gray-100 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default MainLayout;
