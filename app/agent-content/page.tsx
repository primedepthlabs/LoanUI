"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Video,
  FileText,
  Play,
  ExternalLink,
  Search,
  Eye,
  Package,
} from "lucide-react";

interface Agent {
  id: string;
  user_id: string;
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

interface PlanWithContent {
  plan: Plan;
  videos: VideoItem[];
  pdfs: PDFItem[];
}

type ContentType = "all" | "videos" | "pdfs";

const AgentContent: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [plansWithContent, setPlansWithContent] = useState<PlanWithContent[]>(
    []
  );
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [contentFilter, setContentFilter] = useState<ContentType>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<PDFItem | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (agent) {
      fetchAllContent();
    }
  }, [agent]);

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

      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!userData) {
        alert("You are not registered as an agent. Please contact support.");
        router.push("/");
        return;
      }

      const { data: agentData, error: agentError } = await supabase
        .from("agents")
        .select("*")
        .eq("user_id", userData.id)
        .maybeSingle();

      if (agentError || !agentData) {
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
    } catch (error) {
      console.error("Auth check error:", error);
      router.push("/login");
    }
  };

  const fetchAllContent = async () => {
    if (!agent) return;

    try {
      setIsLoading(true);

      // Fetch all purchased plans with their details
      const { data: agentPlansData, error: agentPlansError } = await supabase
        .from("agent_plans")
        .select(
          `
          plan_id,
          plans (
            id,
            plan_name,
            amount
          )
        `
        )
        .eq("agent_id", agent.id)
        .eq("is_active", true);

      if (agentPlansError) throw agentPlansError;

      if (!agentPlansData || agentPlansData.length === 0) {
        console.log("⚠️ Agent has no active plans");
        setPlansWithContent([]);
        setIsLoading(false);
        return;
      }

      // For each plan, fetch its videos and PDFs
      const plansWithContentData: PlanWithContent[] = await Promise.all(
        agentPlansData.map(async (agentPlan) => {
          const plan = Array.isArray(agentPlan.plans)
            ? agentPlan.plans[0]
            : agentPlan.plans;

          // Fetch videos for this plan
          const { data: videosData } = await supabase
            .from("videos")
            .select("*")
            .eq("plan_id", plan.id)
            .order("created_at", { ascending: false });

          // Fetch PDFs for this plan
          const { data: pdfsData } = await supabase
            .from("pdfs")
            .select("*")
            .eq("plan_id", plan.id)
            .order("created_at", { ascending: false });

          return {
            plan: {
              id: plan.id,
              plan_name: plan.plan_name,
              amount: plan.amount,
            },
            videos: videosData || [],
            pdfs: pdfsData || [],
          };
        })
      );

      setPlansWithContent(plansWithContentData);
      console.log("✅ Plans with content loaded:", plansWithContentData);
    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentPlan = (): PlanWithContent | null => {
    return plansWithContent[activePlanIndex] || null;
  };

  const getFilteredContent = () => {
    const currentPlan = getCurrentPlan();
    if (!currentPlan) return { videos: [], pdfs: [] };

    const filteredVideos = currentPlan.videos.filter(
      (video) =>
        video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        video.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredPdfs = currentPlan.pdfs.filter(
      (pdf) =>
        pdf.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pdf.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return { videos: filteredVideos, pdfs: filteredPdfs };
  };

  const { videos: filteredVideos, pdfs: filteredPdfs } = getFilteredContent();

  const shouldShowVideos =
    contentFilter === "all" || contentFilter === "videos";
  const shouldShowPdfs = contentFilter === "all" || contentFilter === "pdfs";

  const getYouTubeEmbedUrl = (url: string): string => {
    const videoIdMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    );
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`;
    }
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

  const handleVideoClick = (videoId: string) => {
    setPlayingVideoId(playingVideoId === videoId ? null : videoId);
  };

  const handlePDFClick = (pdf: PDFItem) => {
    setSelectedPdf(pdf);
    setShowPdfModal(true);
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

  const currentPlan = getCurrentPlan();
  const totalVideos = currentPlan?.videos.length || 0;
  const totalPdfs = currentPlan?.pdfs.length || 0;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
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

          <div className="relative max-w-9xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">
                  Learning Content
                </h1>
                {currentPlan && (
                  <p className="text-sm text-white/80 mt-0.5">
                    {currentPlan.plan.plan_name} • ₹
                    {currentPlan.plan.amount.toLocaleString("en-IN")}
                  </p>
                )}
              </div>

              {/* Stats Badge */}
              <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{totalVideos}</p>
                  <p className="text-xs text-white/80">Videos</p>
                </div>
                <div className="w-px h-8 bg-white/20"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{totalPdfs}</p>
                  <p className="text-xs text-white/80">PDFs</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-9xl mx-auto px-4 py-6">
        {/* Plan Tabs */}
        {plansWithContent.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-3 mb-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {plansWithContent.map((planContent, index) => (
                <button
                  key={planContent.plan.id}
                  onClick={() => {
                    setActivePlanIndex(index);
                    setSearchTerm("");
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                    activePlanIndex === index
                      ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>{planContent.plan.plan_name}</span>
                  <span className="text-xs opacity-75">
                    ({planContent.videos.length + planContent.pdfs.length})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content Filter and Search */}
        {currentPlan && (
          <div className="bg-white rounded-lg shadow-sm p-3 mb-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Content Type Filter */}
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setContentFilter("all")}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    contentFilter === "all"
                      ? "bg-gray-900 text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  All Content
                </button>
                <button
                  onClick={() => setContentFilter("videos")}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    contentFilter === "videos"
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Video className="w-4 h-4" />
                  Videos ({totalVideos})
                </button>
                <button
                  onClick={() => setContentFilter("pdfs")}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    contentFilter === "pdfs"
                      ? "bg-green-600 text-white shadow-md"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  PDFs ({totalPdfs})
                </button>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search content..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* No Plans State */}
        {plansWithContent.length === 0 && (
          <div className="bg-white rounded-lg p-12 text-center shadow-sm">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              No Active Plans
            </h3>
            <p className="text-gray-500">
              You don't have any active plans. Please purchase a plan to access
              content.
            </p>
          </div>
        )}

        {/* Content Display */}
        {currentPlan && (
          <div className="space-y-8">
            {/* Videos Section */}
            {shouldShowVideos && (
              <div>
                {(contentFilter === "all" || contentFilter === "videos") && (
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Video className="w-5 h-5 text-blue-600" />
                    Videos ({filteredVideos.length})
                  </h2>
                )}
                {filteredVideos.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center shadow-sm">
                    <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">
                      {searchTerm
                        ? "No videos found"
                        : "No videos available in this plan"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredVideos.map((video) => (
                      <div
                        key={video.id}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300"
                      >
                        {playingVideoId === video.id ? (
                          // Video Player View
                          <div>
                            <div
                              className="relative"
                              style={{ paddingBottom: "56.25%" }}
                            >
                              <iframe
                                src={getEmbedUrl(video.video_url)}
                                className="absolute inset-0 w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                title={video.title}
                              ></iframe>
                            </div>
                            <div className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <h3 className="font-semibold text-gray-900 text-base flex-1">
                                  {video.title}
                                </h3>
                                <button
                                  onClick={() => setPlayingVideoId(null)}
                                  className="ml-2 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                  <svg
                                    className="w-5 h-5 text-gray-600"
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
                              <p className="text-sm text-gray-500 mb-3">
                                {video.description ||
                                  "No description available"}
                              </p>
                              <div className="flex items-center justify-between text-xs text-gray-500">
                                <span>{formatDate(video.created_at)}</span>
                                <a
                                  href={video.video_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Open
                                </a>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Thumbnail View
                          <div
                            className="cursor-pointer group"
                            onClick={() => handleVideoClick(video.id)}
                          >
                            <div className="relative h-48 bg-gradient-to-br from-blue-500 to-purple-600 overflow-hidden">
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <Play className="w-8 h-8 text-white ml-1" />
                                </div>
                              </div>
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all"></div>
                            </div>
                            <div className="p-4">
                              <h3 className="font-semibold text-gray-900 mb-2 text-base line-clamp-2">
                                {video.title}
                              </h3>
                              <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                                {video.description ||
                                  "No description available"}
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
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* PDFs Section */}
            {shouldShowPdfs && (
              <div>
                {(contentFilter === "all" || contentFilter === "pdfs") && (
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-green-600" />
                    PDF Materials ({filteredPdfs.length})
                  </h2>
                )}
                {filteredPdfs.length === 0 ? (
                  <div className="bg-white rounded-lg p-8 text-center shadow-sm">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">
                      {searchTerm
                        ? "No PDFs found"
                        : "No PDFs available in this plan"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredPdfs.map((pdf) => (
                      <div
                        key={pdf.id}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                      >
                        <div className="relative h-32 bg-gradient-to-br from-green-500 to-teal-600 overflow-hidden">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <FileText className="w-16 h-16 text-white/40" />
                          </div>
                        </div>
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
                            onClick={() => handlePDFClick(pdf)}
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* PDF Modal */}
      {showPdfModal && selectedPdf && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowPdfModal(false);
            setSelectedPdf(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-6xl w-full h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* PDF Header */}
            <div className="bg-gradient-to-br from-green-600 to-teal-700 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex-1 mr-4">
                  <h2 className="text-lg font-bold text-white line-clamp-1">
                    {selectedPdf.title}
                  </h2>
                  {selectedPdf.description && (
                    <p className="text-sm text-white/80 mt-1 line-clamp-2">
                      {selectedPdf.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowPdfModal(false);
                    setSelectedPdf(null);
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

            {/* PDF Viewer */}
            <div className="flex-1 bg-gray-100 overflow-hidden">
              <iframe
                src={`${selectedPdf.pdf_url}#toolbar=0&navpanes=0&scrollbar=1`}
                className="w-full h-full"
                title={selectedPdf.title}
              ></iframe>
            </div>

            {/* PDF Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
                <span>Added on {formatDate(selectedPdf.created_at)}</span>
                <span className="text-gray-400">•</span>
                <span className="font-medium">
                  {formatFileSize(selectedPdf.file_size)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentContent;
