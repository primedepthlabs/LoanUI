"use client";

import React, { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  Upload,
  User,
  Mail,
  Phone,
  CreditCard,
  Building,
  FileText,
  Camera,
  CheckCircle,
  X,
  Trash2,
  ShoppingCart,
  QrCode,
  IndianRupee,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
interface FormData {
  name: string;
  age: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobileNumber: string;
  aadhaarFront: File[] | null;
  aadhaarBack: File[] | null;
  panCard: File[] | null;
  bankPassbook: File[] | null;
  passportPhoto: File[] | null;
}

interface FormErrors {
  [key: string]: string;
}

interface SuccessNotificationProps {
  message: string;
  onClose: () => void;
}

interface PaymentSettings {
  qr_code_url: string;
  payment_amount: number;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    duplicateCheckTimeout?: NodeJS.Timeout;
  }
}

// Utility functions
const utils = {
  validateIndianPhone: (phone: string): boolean => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone);
  },
  formatError: (error: string): string => {
    const errorMessages: { [key: string]: string } = {
      "Email already registered":
        "An account with this email already exists. Please use a different email or try signing in.",
      "Invalid email": "Please enter a valid email address.",
      "Password should be at least 6 characters":
        "Password must be at least 6 characters long.",
      "User already registered":
        "This account already exists. Please sign in instead.",
      "Invalid login credentials":
        "Invalid email or password. Please check your credentials and try again.",
      "Email not confirmed":
        "Please check your email and click the verification link before signing in.",
      "Too many requests":
        "Too many attempts. Please wait a moment before trying again.",
    };
    return (
      errorMessages[error] ||
      error ||
      "An unexpected error occurred. Please try again."
    );
  },
};

// Service functions
const userService = {
  checkEmailExists: async (email: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (error) throw error;
      return { success: true, exists: !!data };
    } catch (error) {
      console.error("Email check error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
  createUser: async (
    userData: FormData,
    documentUrls: {
      aadhaarFront: string[];
      aadhaarBack: string[];
      panCard: string[];
      bankPassbook: string[];
      passportPhoto: string[];
    },
    authUserId: string,
    paymentScreenshotUrl: string,
    paymentAmount: number
  ) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .insert([
          {
            name: userData.name.trim(),
            age: parseInt(userData.age),
            email: userData.email.toLowerCase().trim(),
            mobile_number: userData.mobileNumber.trim(),
            auth_user_id: authUserId,
            aadhaar_front_photos: documentUrls.aadhaarFront,
            aadhaar_back_photos: documentUrls.aadhaarBack,
            pan_card_photos: documentUrls.panCard,
            bank_passbook_photos: documentUrls.bankPassbook,
            passport_photo_urls: documentUrls.passportPhoto,
            kyc_status: "pending",
            kyc_submitted_at: new Date().toISOString(),
            payment_screenshot_url: paymentScreenshotUrl,
            payment_status: "pending",
            payment_amount: paymentAmount,
            payment_submitted_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return { success: true, user: data };
    } catch (error) {
      console.error("User creation error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
};

const authService = {
  signUp: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      });

      if (error) throw error;
      return { success: true, user: data.user, session: data.session };
    } catch (error) {
      console.error("Sign up error:", error);
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

const storageService = {
  uploadDocumentPhotos: async (
    files: File[],
    userId: string,
    documentType: string
  ) => {
    try {
      const uploadPromises = files.map(async (file, index) => {
        const fileExtension = file.name.split(".").pop();
        const fileName = `${userId}/${documentType}-${
          index + 1
        }-${Date.now()}.${fileExtension}`;

        const { data, error } = await supabase.storage
          .from("user-documents")
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from("user-documents")
          .getPublicUrl(fileName);

        return {
          path: data.path,
          publicUrl: publicUrlData.publicUrl,
          fileName: file.name,
        };
      });

      const results = await Promise.all(uploadPromises);
      return {
        success: true,
        photos: results,
      };
    } catch (error) {
      console.error("Document upload error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
  uploadPaymentScreenshot: async (file: File, userId: string) => {
    try {
      const fileExtension = file.name.split(".").pop();
      const fileName = `${userId}/payment-screenshot-${Date.now()}.${fileExtension}`;

      const { data, error } = await supabase.storage
        .from("user-documents")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("user-documents")
        .getPublicUrl(fileName);

      return {
        success: true,
        publicUrl: publicUrlData.publicUrl,
      };
    } catch (error) {
      console.error("Payment screenshot upload error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
};

const paymentService = {
  getPaymentSettings: async () => {
    try {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("qr_code_url, payment_amount")
        .single();

      if (error) throw error;
      return { success: true, settings: data as PaymentSettings };
    } catch (error) {
      console.error("Payment settings fetch error:", error);
      return { success: false, error: (error as Error).message };
    }
  },
};

const registrationService = {
  completeRegistration: async (
    formData: FormData,
    paymentScreenshot: File,
    paymentAmount: number
  ) => {
    try {
      // Check for existing email
      const emailCheck = await userService.checkEmailExists(formData.email);
      if (emailCheck.exists) {
        return { success: false, error: "Email already registered" };
      }

      // Sign up the user
      const authResult = await authService.signUp(
        formData.email,
        formData.password
      );
      if (!authResult.success || !authResult.user?.id) {
        return {
          success: false,
          error: authResult.error || "Failed to create user account",
        };
      }
      const userId = authResult.user.id;

      // Simple wait for database sync
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Upload payment screenshot first
      const paymentUploadResult = await storageService.uploadPaymentScreenshot(
        paymentScreenshot,
        userId
      );

      if (!paymentUploadResult.success || !paymentUploadResult.publicUrl) {
        await authService.signOut();
        return {
          success: false,
          error:
            "Failed to upload payment screenshot: " +
            (paymentUploadResult.error || "Unknown error"),
        };
      }

      // Upload all document photos
      const uploadPromises = [];
      const documentTypes = [
        { files: formData.aadhaarFront, type: "aadhaar-front" },
        { files: formData.aadhaarBack, type: "aadhaar-back" },
        { files: formData.panCard, type: "pan-card" },
        { files: formData.bankPassbook, type: "bank-passbook" },
        { files: formData.passportPhoto, type: "passport-photo" },
      ];

      for (const doc of documentTypes) {
        if (doc.files && doc.files.length > 0) {
          uploadPromises.push(
            storageService.uploadDocumentPhotos(doc.files, userId, doc.type)
          );
        }
      }

      const uploadResults = await Promise.all(uploadPromises);

      // Check if any uploads failed
      for (const result of uploadResults) {
        if (!result.success) {
          await authService.signOut();
          return {
            success: false,
            error: "Failed to upload documents: " + result.error,
          };
        }
      }

      // Organize uploaded URLs by document type
      const documentUrls = {
        aadhaarFront: uploadResults[0]?.photos?.map((p) => p.publicUrl) || [],
        aadhaarBack: uploadResults[1]?.photos?.map((p) => p.publicUrl) || [],
        panCard: uploadResults[2]?.photos?.map((p) => p.publicUrl) || [],
        bankPassbook: uploadResults[3]?.photos?.map((p) => p.publicUrl) || [],
        passportPhoto: uploadResults[4]?.photos?.map((p) => p.publicUrl) || [],
      };

      // Create user record with document URLs and payment info
      const userResult = await userService.createUser(
        formData,
        documentUrls,
        userId,
        paymentUploadResult.publicUrl,
        paymentAmount
      );

      if (!userResult.success) {
        await authService.signOut();
        return { success: false, error: userResult.error };
      }

      const totalPhotos = Object.values(documentUrls).flat().length;
      return {
        success: true,
        message: `Registration successful! ${totalPhotos} document photos and payment screenshot uploaded. Your payment is under verification. Please check your email to verify your account.`,
        user: userResult.user,
      };
    } catch (error) {
      console.error("Complete registration error:", error);
      return {
        success: false,
        error: "Registration failed. Please try again.",
      };
    }
  },
};

const DocumentPhotoSignupForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    age: "",
    email: "",
    password: "",
    confirmPassword: "",
    mobileNumber: "",
    aadhaarFront: null,
    aadhaarBack: null,
    panCard: null,
    bankPassbook: null,
    passportPhoto: null,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const router = useRouter();
  // Payment modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [paymentSettings, setPaymentSettings] =
    useState<PaymentSettings | null>(null);
  const [loadingPaymentSettings, setLoadingPaymentSettings] = useState(false);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (window.duplicateCheckTimeout) {
        clearTimeout(window.duplicateCheckTimeout);
      }
    };
  }, []);

  // Fetch payment settings when modal opens
  useEffect(() => {
    if (showPaymentModal && !paymentSettings) {
      fetchPaymentSettings();
    }
  }, [showPaymentModal]);

  const fetchPaymentSettings = async () => {
    setLoadingPaymentSettings(true);
    try {
      const result = await paymentService.getPaymentSettings();
      if (result.success && result.settings) {
        setPaymentSettings(result.settings);
      } else {
        alert("Failed to load payment settings. Please try again.");
        setShowPaymentModal(false);
      }
    } catch (error) {
      console.error("Error fetching payment settings:", error);
      alert("Failed to load payment settings. Please try again.");
      setShowPaymentModal(false);
    } finally {
      setLoadingPaymentSettings(false);
    }
  };

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
          className="ml-2 text-white hover:text-gray-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    } else if (formData.name.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    // Age validation
    if (!formData.age) {
      newErrors.age = "Age is required";
    } else if (parseInt(formData.age) < 18 || parseInt(formData.age) > 100) {
      newErrors.age = "Age must be between 18 and 100";
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Please enter a valid email";
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    // Mobile number validation
    if (!formData.mobileNumber) {
      newErrors.mobileNumber = "Mobile number is required";
    } else if (!utils.validateIndianPhone(formData.mobileNumber)) {
      newErrors.mobileNumber =
        "Please enter a valid 10-digit mobile number starting with 6-9";
    }

    // Document photo validations - all are required
    if (!formData.aadhaarFront || formData.aadhaarFront.length === 0) {
      newErrors.aadhaarFront = "Aadhaar front photo is required";
    }

    if (!formData.aadhaarBack || formData.aadhaarBack.length === 0) {
      newErrors.aadhaarBack = "Aadhaar back photo is required";
    }

    if (!formData.panCard || formData.panCard.length === 0) {
      newErrors.panCard = "PAN card photo is required";
    }

    if (!formData.bankPassbook || formData.bankPassbook.length === 0) {
      newErrors.bankPassbook = "Bank passbook front page photo is required";
    }

    if (!formData.passportPhoto || formData.passportPhoto.length === 0) {
      newErrors.passportPhoto = "Passport photos are required";
    } else if (formData.passportPhoto.length !== 2) {
      newErrors.passportPhoto = "Exactly 2 passport photos are required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }

    // Check email duplicates
    if (name === "email") {
      if (window.duplicateCheckTimeout) {
        clearTimeout(window.duplicateCheckTimeout);
      }

      window.duplicateCheckTimeout = setTimeout(async () => {
        if (value && value.includes("@")) {
          setIsCheckingDuplicates(true);
          try {
            const result = await userService.checkEmailExists(value);
            if (result.exists) {
              setErrors((prev) => ({
                ...prev,
                email: "This email is already registered",
              }));
            } else if (result.success && !result.exists) {
              setErrors((prev) => {
                const newErrors = { ...prev };
                if (newErrors.email === "This email is already registered") {
                  delete newErrors.email;
                }
                return newErrors;
              });
            }
          } catch (error) {
            console.error("Email check error:", error);
          } finally {
            setIsCheckingDuplicates(false);
          }
        }
      }, 1000);
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldName: keyof FormData
  ) => {
    const files = Array.from(e.target.files || []);

    if (files.length === 0) return;

    // Validate each file
    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    // Set expected number of files for each document type
    const expectedCounts = {
      aadhaarFront: 1,
      aadhaarBack: 1,
      panCard: 1,
      bankPassbook: 1,
      passportPhoto: 2,
    };

    const expectedCount =
      expectedCounts[fieldName as keyof typeof expectedCounts] || 1;

    if (files.length !== expectedCount) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: `Please upload exactly ${expectedCount} photo(s)`,
      }));
      return;
    }

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        setErrors((prev) => ({
          ...prev,
          [fieldName]: "Please upload valid image files (JPG, JPEG, PNG)",
        }));
        return;
      }

      if (file.size > maxSize) {
        setErrors((prev) => ({
          ...prev,
          [fieldName]: "Each file must be less than 5MB",
        }));
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      [fieldName]: files,
    }));

    if (errors[fieldName]) {
      setErrors((prev) => ({
        ...prev,
        [fieldName]: "",
      }));
    }
  };

  const removeFile = (fieldName: keyof FormData, indexToRemove: number) => {
    const currentFiles = formData[fieldName] as File[] | null;
    if (!currentFiles) return;

    const updatedFiles = currentFiles.filter(
      (_, index) => index !== indexToRemove
    );
    setFormData((prev) => ({
      ...prev,
      [fieldName]: updatedFiles.length > 0 ? updatedFiles : null,
    }));
  };

  const handlePaymentScreenshotChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      alert("Please upload a valid image file (JPG, JPEG, PNG)");
      return;
    }

    if (file.size > maxSize) {
      alert("File must be less than 5MB");
      return;
    }

    setPaymentScreenshot(file);
  };

  const handleCheckout = () => {
    if (!validateForm()) {
      return;
    }
    setShowPaymentModal(true);
  };

  const handleCompleteRegistration = async () => {
    if (!paymentScreenshot) {
      alert("Please upload payment screenshot");
      return;
    }

    if (!paymentSettings) {
      alert("Payment settings not loaded");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await registrationService.completeRegistration(
        formData,
        paymentScreenshot,
        paymentSettings.payment_amount
      );

      if (result.success) {
        setSuccessMessage(
          result.message ||
            "Registration successful! Your payment is under verification. Please check your email to verify your account."
        );
        setShowSuccess(true);
        setShowPaymentModal(false);

        // Reset form
        setFormData({
          name: "",
          age: "",
          email: "",
          password: "",
          confirmPassword: "",
          mobileNumber: "",
          aadhaarFront: null,
          aadhaarBack: null,
          panCard: null,
          bankPassbook: null,
          passportPhoto: null,
        });

        // Reset all file inputs
        const fileInputIds = [
          "aadhaarFront",
          "aadhaarBack",
          "panCard",
          "bankPassbook",
          "passportPhoto",
        ];
        fileInputIds.forEach((id) => {
          const fileInput = document.getElementById(id) as HTMLInputElement;
          if (fileInput) fileInput.value = "";
        });

        setPaymentScreenshot(null);
        setErrors({});
      } else {
        const errorMessage = utils.formatError(result.error || "");
        alert(errorMessage);

        if (result.error?.includes("Email already registered")) {
          setErrors((prev) => ({
            ...prev,
            email: "This email is already registered",
          }));
        }
      }
    } catch (error) {
      console.error("Registration error:", error);
      const errorMessage = utils.formatError((error as Error).message);
      alert(errorMessage || "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);

      router.push("/");
    }
  };

  const FileUploadSection = ({
    fieldName,
    label,
    icon,
    expectedCount = 1,
    description,
  }: {
    fieldName: keyof FormData;
    label: string;
    icon: React.ReactNode;
    expectedCount?: number;
    description: string;
  }) => {
    const files = formData[fieldName] as File[] | null;
    const error = errors[fieldName];

    return (
      <div className="w-full">
        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
          {icon}
          {label} * (Required: {expectedCount} photo
          {expectedCount > 1 ? "s" : ""})
        </label>
        <div
          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors hover:border-yellow-400 hover:bg-yellow-50 ${
            error ? "border-red-500 bg-red-50" : "border-gray-300"
          }`}
        >
          <Upload className="mx-auto w-6 h-6 sm:w-8 sm:h-8 text-gray-400 mb-2" />
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            onChange={(e) => handleFileChange(e, fieldName)}
            className="hidden"
            id={fieldName}
            multiple={expectedCount > 1}
          />
          <label
            htmlFor={fieldName}
            className="cursor-pointer text-yellow-600 hover:text-yellow-500 font-medium text-sm transition-colors"
          >
            Click to upload {label.toLowerCase()}
          </label>
          <p className="text-gray-500 text-xs mt-1">{description}</p>
          <p className="text-gray-500 text-xs">JPG, JPEG, PNG up to 5MB each</p>

          {/* Display selected files */}
          {files && files.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-green-600 text-xs font-medium">
                Selected {files.length} photo(s):
              </p>
              <div className="space-y-1">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-white p-2 rounded border text-left"
                  >
                    <span className="text-xs text-gray-700 truncate flex-1 mr-2">
                      {index + 1}. {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(fieldName, index)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                      title="Remove file"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p className="text-red-500 text-xs sm:text-sm mt-1">{error}</p>
        )}
      </div>
    );
  };

  return (
    <>
      {showSuccess && (
        <SuccessNotification
          message={successMessage}
          onClose={() => setShowSuccess(false)}
        />
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Complete Payment
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {loadingPaymentSettings ? (
              <div className="flex justify-center items-center py-12">
                <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Payment Amount */}
                <div className="mb-6 text-center bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200">
                  <p className="text-sm text-gray-600 mb-2">Amount to Pay</p>
                  <div className="flex items-center justify-center text-4xl font-bold text-yellow-600">
                    <IndianRupee className="w-8 h-8" />
                    {paymentSettings?.payment_amount}
                  </div>
                </div>

                {/* QR Code */}
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3 text-center">
                    Scan QR Code to Pay
                  </p>
                  <div className="border-2 border-yellow-200 rounded-lg p-4 bg-yellow-50 flex justify-center">
                    {paymentSettings?.qr_code_url ? (
                      <img
                        src={paymentSettings.qr_code_url}
                        alt="Payment QR Code"
                        className="w-64 h-64 object-contain"
                      />
                    ) : (
                      <div className="w-64 h-64 flex items-center justify-center bg-white rounded">
                        <QrCode className="w-16 h-16 text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Payment Screenshot */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Camera className="inline w-4 h-4 mr-1" />
                    Upload Payment Screenshot *
                  </label>
                  <div className="border-2 border-dashed border-yellow-300 rounded-lg p-4 text-center hover:border-yellow-400 hover:bg-yellow-50 transition-colors">
                    <Upload className="mx-auto w-8 h-8 text-gray-400 mb-2" />
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handlePaymentScreenshotChange}
                      className="hidden"
                      id="paymentScreenshot"
                    />
                    <label
                      htmlFor="paymentScreenshot"
                      className="cursor-pointer text-yellow-600 hover:text-yellow-500 font-medium text-sm"
                    >
                      {paymentScreenshot
                        ? "Change Screenshot"
                        : "Click to upload screenshot"}
                    </label>
                    <p className="text-gray-500 text-xs mt-1">
                      JPG, PNG up to 5MB
                    </p>

                    {paymentScreenshot && (
                      <div className="mt-3 bg-white p-3 rounded border-2 border-green-200 flex items-center justify-between">
                        <div className="flex items-center">
                          <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
                          <span className="text-xs text-gray-700 truncate">
                            {paymentScreenshot.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPaymentScreenshot(null)}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleCompleteRegistration}
                  disabled={!paymentScreenshot || isSubmitting}
                  className={`w-full py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold text-white text-sm sm:text-base transition-all duration-200 ${
                    !paymentScreenshot || isSubmitting
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-yellow-500 hover:bg-yellow-600 focus:ring-4 focus:ring-yellow-300 shadow-lg hover:shadow-xl"
                  }`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    <>
                      <CheckCircle className="inline w-5 h-5 mr-2" />
                      Done Payment and Create Account
                    </>
                  )}
                </button>

                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-xs text-yellow-800 text-center">
                    🔒 Your payment will be verified by admin within 24 hours
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="min-h-screen bg-yellow-50 py-4 sm:py-8 lg:py-12 px-3 sm:px-4 lg:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 lg:p-8 border border-yellow-200">
            <div className="bg-yellow-500 text-white text-center py-6 sm:py-8 -mx-4 sm:-mx-6 lg:-mx-8 mb-6 sm:mb-8 rounded-t-2xl">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
                Create Account
              </h1>
              <p className="text-sm sm:text-base text-yellow-100">
                Please fill in all required information and upload all document
                photos for KYC verification
              </p>
            </div>

            <div className="space-y-4 sm:space-y-6">
              {/* Basic Information Section */}
              <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-yellow-500">
                <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-3 flex items-center">
                  <User className="w-4 h-4 mr-2 text-yellow-600" />
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="w-full">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors bg-white ${
                        errors.name ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="Enter your full name"
                    />
                    {errors.name && (
                      <p className="text-red-500 text-xs sm:text-sm mt-1">
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div className="w-full">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      Age *
                    </label>
                    <input
                      type="number"
                      name="age"
                      value={formData.age}
                      onChange={handleInputChange}
                      min="18"
                      max="100"
                      className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors bg-white ${
                        errors.age ? "border-red-500" : "border-gray-300"
                      }`}
                      placeholder="Enter your age"
                    />
                    {errors.age && (
                      <p className="text-red-500 text-xs sm:text-sm mt-1">
                        {errors.age}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Information Section */}
              <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-yellow-500">
                <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-3 flex items-center">
                  <Mail className="w-4 h-4 mr-2 text-yellow-600" />
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="w-full">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      Email Address *
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors bg-white ${
                          errors.email ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder="Enter your email"
                      />
                      {isCheckingDuplicates && (
                        <div className="absolute right-3 top-3">
                          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                    {errors.email && (
                      <p className="text-red-500 text-xs sm:text-sm mt-1">
                        {errors.email}
                      </p>
                    )}
                    {!errors.email &&
                      formData.email &&
                      formData.email.includes("@") && (
                        <p className="text-green-600 text-xs sm:text-sm mt-1">
                          ✓ Email format is valid
                        </p>
                      )}
                  </div>

                  <div className="w-full">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      <Phone className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      name="mobileNumber"
                      value={formData.mobileNumber}
                      onChange={handleInputChange}
                      className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors bg-white ${
                        errors.mobileNumber
                          ? "border-red-500"
                          : "border-gray-300"
                      }`}
                      placeholder="Enter 10-digit mobile number"
                      maxLength={10}
                    />
                    {errors.mobileNumber && (
                      <p className="text-red-500 text-xs sm:text-sm mt-1">
                        {errors.mobileNumber}
                      </p>
                    )}
                    {!errors.mobileNumber &&
                      formData.mobileNumber.length === 10 &&
                      utils.validateIndianPhone(formData.mobileNumber) && (
                        <p className="text-green-600 text-xs sm:text-sm mt-1">
                          ✓ Valid mobile number format
                        </p>
                      )}
                  </div>
                </div>
              </div>

              {/* Security Section */}
              <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-yellow-500">
                <h3 className="text-sm sm:text-base font-semibold text-gray-800 mb-3 flex items-center">
                  <Eye className="w-4 h-4 mr-2 text-yellow-600" />
                  Security Information
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  <div className="w-full">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        className={`w-full px-3 sm:px-4 py-2 sm:py-3 pr-10 sm:pr-12 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors bg-white ${
                          errors.password ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder="Enter password (min 8 characters)"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 sm:right-3 top-2 sm:top-3 text-gray-500 hover:text-yellow-600 transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                        ) : (
                          <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-red-500 text-xs sm:text-sm mt-1">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div className="w-full">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className={`w-full px-3 sm:px-4 py-2 sm:py-3 pr-10 sm:pr-12 text-sm sm:text-base border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors bg-white ${
                          errors.confirmPassword
                            ? "border-red-500"
                            : "border-gray-300"
                        }`}
                        placeholder="Confirm password"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-2 sm:right-3 top-2 sm:top-3 text-gray-500 hover:text-yellow-600 transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                        ) : (
                          <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-red-500 text-xs sm:text-sm mt-1">
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* KYC Document Photos Section */}
              <div className="border-t-4 border-yellow-500 pt-4 sm:pt-6 mt-6 sm:mt-8">
                <div className="bg-yellow-50 p-4 rounded-lg mb-4">
                  <h3 className="text-base sm:text-lg font-semibold text-yellow-800 mb-1 text-center sm:text-left flex items-center justify-center sm:justify-start">
                    <Camera className="w-5 h-5 mr-2" />
                    KYC Document Photos
                  </h3>
                  <p className="text-sm text-yellow-700 text-center sm:text-left">
                    Upload clear photos of all required documents for
                    verification
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Aadhaar Card Photos */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <FileUploadSection
                      fieldName="aadhaarFront"
                      label="Aadhaar Card Front"
                      icon={
                        <FileText className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      }
                      expectedCount={1}
                      description="Clear photo of Aadhaar front side"
                    />
                    <FileUploadSection
                      fieldName="aadhaarBack"
                      label="Aadhaar Card Back"
                      icon={
                        <FileText className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      }
                      expectedCount={1}
                      description="Clear photo of Aadhaar back side"
                    />
                  </div>

                  {/* PAN Card Photo */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <FileUploadSection
                      fieldName="panCard"
                      label="PAN Card"
                      icon={
                        <CreditCard className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      }
                      expectedCount={1}
                      description="Clear photo of PAN card"
                    />
                    <FileUploadSection
                      fieldName="bankPassbook"
                      label="Bank Passbook Front Page"
                      icon={
                        <Building className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      }
                      expectedCount={1}
                      description="Clear photo of bank passbook front page with account details"
                    />
                  </div>

                  {/* Passport Photos */}
                  <div className="grid grid-cols-1">
                    <FileUploadSection
                      fieldName="passportPhoto"
                      label="Passport Photos"
                      icon={
                        <Camera className="inline w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                      }
                      expectedCount={2}
                      description="Upload exactly 2 passport-size photos"
                    />
                  </div>
                </div>
              </div>

              {/* Checkout Button */}
              <div className="pt-4 sm:pt-6">
                <button
                  type="button"
                  onClick={handleCheckout}
                  className="w-full py-3 sm:py-4 px-4 sm:px-6 rounded-lg font-semibold text-white text-sm sm:text-base transition-all duration-200 bg-yellow-500 hover:bg-yellow-600 focus:ring-4 focus:ring-yellow-300 shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Proceed to Checkout
                </button>

                <div className="mt-3 sm:mt-4 text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-600 mb-2">
                    🔒 Your information and documents are secure and encrypted
                  </p>
                  <p className="text-xs sm:text-sm text-gray-500">
                    By creating an account, you agree to our Terms of Service
                    and Privacy Policy
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DocumentPhotoSignupForm;
