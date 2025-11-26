"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Language {
  code: string;
  name: string;
  localName: string;
}

interface LanguageSelectionProps {
  onLanguageSelect?: (language: string) => void;
}
const LanguageSelection: React.FC<LanguageSelectionProps> = ({
  onLanguageSelect,
}) => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("english");
  const router = useRouter();

  //
  useEffect(() => {
    const hasSelected = localStorage.getItem("hasSelectedLanguage");
    const savedLanguage = localStorage.getItem("selectedLanguage");

    if (hasSelected === "true" && savedLanguage) {
      router.replace(`/firstview?language=${savedLanguage}`);
    }
  }, []);
  //
  const languages: Language[] = [
    { code: "english", name: "English", localName: "English" },
    { code: "hindi", name: "हिंदी", localName: "Hindi" },
  ];

  const handleLanguageSelect = (languageCode: string): void => {
    setSelectedLanguage(languageCode);
    localStorage.setItem("selectedLanguage", languageCode);
    localStorage.setItem("hasSelectedLanguage", "true");
    router.push(`/firstview?language=${languageCode}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex justify-center p-2 sm:p-4">
      {/* Main Container - Responsive width with max constraints */}
      <div className="w-full max-w-md mx-auto flex items-center min-h-screen">
        {/* Main Content Card */}
        <div className="bg-white rounded-3xl shadow-lg p-4 sm:p-6 lg:p-8 flex flex-col w-full max-h-[90vh] overflow-y-auto">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
                {/* Folder Icon */}
                <img src="logo.jpg" alt="Finance" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 text-center mb-2 leading-tight">
            Choose Your Display
            <br />
            Language
          </h1>

          {/* Subtitle in Hindi */}
          <p className="text-gray-600 text-center mb-8 text-sm sm:text-base">
            अपनी प्रदर्शन भाषा चुनें
          </p>

          {/* Language Options */}
          <div className="flex flex-col gap-3 mb-6 flex-grow">
            {languages.map((language) => (
              <button
                key={language.code}
                onClick={() => handleLanguageSelect(language.code)}
                className={`p-4 sm:p-5 rounded-xl border-2 flex items-center cursor-pointer justify-between transition-all duration-200 hover:shadow-md ${
                  selectedLanguage === language.code
                    ? "border-yellow-400 bg-yellow-50 shadow-sm"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex flex-col items-start">
                  <span className="text-base sm:text-lg font-semibold text-gray-800">
                    {language.name}
                  </span>
                  <span className="text-xs sm:text-sm text-gray-500">
                    {language.localName}
                  </span>
                </div>
                {selectedLanguage === language.code && (
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-yellow-400 flex items-center justify-center shadow-sm">
                    <span className="text-white text-base font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSelection;
