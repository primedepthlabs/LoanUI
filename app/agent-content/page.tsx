"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Video,
  FileText,
  Play,
  Download,
  ExternalLink,
  Lock,
  AlertCircle,
  Search,
  Filter,
  Eye,
} from "lucide-react";

interface Agent {
  id: string;
  user_id: string;
  plan_id: string;
  referral_code: string;
  is_active: boolean;
}

interface Plan {
  id: string;
  plan_name: string;
  amount: number;
}

interface VideoItem {
  id: string;
  title: string;
  video_url: string;
  description: string;
  plan_id: string;
  created_at: string;
}

interface PDFItem {
  id: string;
  title: string;
  pdf_url: string;
  description: string;
  plan_id: string;
  file_size?: number;
  created_at: string;
}

type ContentTab = "videos" | "pdfs";

const AgentContent: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [pdfs, setPdfs] = useState<PDFItem[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoItem[]>([]);
  const [filteredPdfs, setFilteredPdfs] = useState<PDFItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ContentTab>("videos");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (agent) {
      fetchContent();
    }
  }, [agent]);

  useEffect(() => {
    filterContent();
  }, [videos, pdfs, searchTerm, activeTab]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      setUser(session.user);

      // Step 1: Get user's internal ID from users table
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) {
        console.error("User not found in users table");
        alert("You are not registered as an agent. Please contact support.");
        router.push("/");
        return;
      }

      // Step 2: Fetch agent data using internal user_id
      const { data: agentData, error: agentError } = await supabase
        .from("agents")
        .select("*")
        .eq("user_id", userData.id)
        .maybeSingle();

      if (agentError || !agentData) {
        console.error("Not an agent:", agentError);
        alert("You are not registered as an agent. Please contact support.");
        router.push("/");
        return;
      }

      if (!agentData.is_active) {
        alert("Your agent account is inactive. Please contact support.");
        router.push("/");
        return;
      }

      setAgent(agentData);

      // Fetch plan details
      const { data: planData } = await supabase
        .from("plans")
        .select("*")
        .eq("id", agentData.plan_id)
        .single();

      setPlan(planData);
    } catch (error) {
      console.error("Auth check error:", error);
      router.push("/login");
    }
  };

  const fetchContent = async () => {
    if (!agent) return;

    try {
      setIsLoading(true);

      // Fetch videos for this plan
      const { data: videosData, error: videosError } = await supabase
        .from("videos")
        .select("*")
        .eq("plan_id", agent.plan_id)
        .order("created_at", { ascending: false });

      if (videosError) throw videosError;
      setVideos(videosData || []);

      // Fetch PDFs for this plan
      const { data: pdfsData, error: pdfsError } = await supabase
        .from("pdfs")
        .select("*")
        .eq("plan_id", agent.plan_id)
        .order("created_at", { ascending: false });

      if (pdfsError) throw pdfsError;
      setPdfs(pdfsData || []);
    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterContent = () => {
    if (activeTab === "videos") {
      const filtered = videos.filter(
        (video) =>
          video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          video.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredVideos(filtered);
    } else {
      const filtered = pdfs.filter(
        (pdf) =>
          pdf.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pdf.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPdfs(filtered);
    }
  };

  const getYouTubeEmbedUrl = (url: string): string => {
    // Convert various YouTube URL formats to embed format
    const videoIdMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`;
    }
    // If already an embed URL or other format, return as is
    return url.includes("embed") ? url : url;
  };

  const getVimeoEmbedUrl = (url: string): string => {
    const videoIdMatch = url.match(/vimeo\.com\/(\d+)/);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://player.vimeo.com/video/${videoIdMatch[1]}`;
    }
    return url;
  };

  const getEmbedUrl = (url: string): string => {
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      return getYouTubeEmbedUrl(url);
    } else if (url.includes("vimeo.com")) {
      return getVimeoEmbedUrl(url);
    }
    return url;
  };

  const handleVideoClick = (video: VideoItem) => {
    setSelectedVideo(video);
    setShowVideoModal(true);
  };

  const handlePDFClick = (pdfUrl: string) => {
    window.open(pdfUrl, "_blank");
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "N/A";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Matching Dashboard Theme */}
      <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 shadow-sm">
        <div className="relative">
          <div className="absolute inset-0 opacity-10">
            <div
              style={{
                backgroundImage:
                  "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              className="w-full h-full"
            />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">
                    Learning Content
                  </h1>
                  {plan && (
                    <p className="text-sm text-white/80 mt-0.5">
                      {plan.plan_name} • ₹{plan.amount.toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>

              {/* Stats Badge */}
              <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {videos.length}
                  </p>
                  <p className="text-xs text-white/80">Videos</p>
                </div>
                <div className="w-px h-8 bg-white/20"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{pdfs.length}</p>
                  <p className="text-xs text-white/80">PDFs</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs and Search */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setActiveTab("videos")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "videos"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Video className="w-4 h-4" />
                Videos ({videos.length})
              </button>
              <button
                onClick={() => setActiveTab("pdfs")}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "pdfs"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <FileText className="w-4 h-4" />
                PDFs ({pdfs.length})
              </button>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Videos Grid */}
        {activeTab === "videos" && (
          <>
            {filteredVideos.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Video className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {searchTerm ? "No videos found" : "No videos available"}
                </h3>
                <p className="text-gray-500">
                  {searchTerm
                    ? "Try adjusting your search"
                    : "Videos will appear here once added to your plan"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group"
                    onClick={() => handleVideoClick(video)}
                  >
                    {/* Video Thumbnail */}
                    <div className="relative h-48 bg-gradient-to-br from-blue-500 to-purple-600 overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play className="w-8 h-8 text-white ml-1" />
                        </div>
                      </div>
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all"></div>
                    </div>

                    {/* Video Info */}
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-base line-clamp-2">
                        {video.title}
                      </h3>
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {video.description || "No description available"}
                      </p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{formatDate(video.created_at)}</span>
                        <div className="flex items-center gap-1 text-blue-600 font-medium">
                          <Play className="w-3 h-3" />
                          Watch Now
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* PDFs Grid */}
        {activeTab === "pdfs" && (
          <>
            {filteredPdfs.length === 0 ? (
              <div className="bg-white rounded-lg p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {searchTerm ? "No PDFs found" : "No PDFs available"}
                </h3>
                <p className="text-gray-500">
                  {searchTerm
                    ? "Try adjusting your search"
                    : "PDF materials will appear here once added to your plan"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPdfs.map((pdf) => (
                  <div
                    key={pdf.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                  >
                    {/* PDF Header */}
                    <div className="relative h-32 bg-gradient-to-br from-green-500 to-teal-600 overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <FileText className="w-16 h-16 text-white/40" />
                      </div>
                    </div>

                    {/* PDF Info */}
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-base line-clamp-2">
                        {pdf.title}
                      </h3>
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                        {pdf.description || "No description available"}
                      </p>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <span>{formatDate(pdf.created_at)}</span>
                        <span className="font-medium">
                          {formatFileSize(pdf.file_size)}
                        </span>
                      </div>
                      <button
                        onClick={() => handlePDFClick(pdf.pdf_url)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Open PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Video Modal */}
      {showVideoModal && selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowVideoModal(false);
            setSelectedVideo(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-5xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-slate-700 to-slate-900 p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <h2 className="text-lg font-bold text-white line-clamp-1">
                    {selectedVideo.title}
                  </h2>
                  {selectedVideo.description && (
                    <p className="text-sm text-white/80 mt-1 line-clamp-2">
                      {selectedVideo.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowVideoModal(false);
                    setSelectedVideo(null);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                >
                  <svg
                    className="w-6 h-6 text-white"
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
            </div>

            {/* Video Player */}
            <div className="relative" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src={getEmbedUrl(selectedVideo.video_url)}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={selectedVideo.title}
              ></iframe>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Added on {formatDate(selectedVideo.created_at)}</span>
                <a
                  href={selectedVideo.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in new tab
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentContent;
