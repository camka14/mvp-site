"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/app/providers";
import { useChat } from "@/context/ChatContext";
import { useChatUI } from "@/context/ChatUIContext";
import { authService } from "@/lib/auth";
import { billingAddressService } from "@/lib/billingAddressService";
import {
  isSupportedBillingCountryCode,
  isSupportedUsStateCode,
  normalizeBillingCountryCode,
  normalizeUsStateCode,
} from "@/lib/billingAddressOptions";
import { userService, type UserSocialGraph } from "@/lib/userService";
import {
  familyService,
  FamilyChild,
  FamilyJoinRequest,
} from "@/lib/familyService";
import { ImageUploader } from "@/components/ui/ImageUploader";
import {
  BillingAddress,
  Bill,
  PaymentIntent,
  Team,
  UserData,
  getUserAvatarUrl,
  formatPrice,
  formatBillAmount,
  Product,
  Organization,
  getUserFullName,
  getUserHandle,
  isUserSocialInteractionRestricted,
} from "@/types";
import type { Subscription } from "@/types";
import Loading from "@/components/ui/Loading";
import Navigation from "@/components/layout/Navigation";
import {
  Container,
  Group,
  Title,
  Text,
  Button,
  Paper,
  TextInput,
  Alert,
  Avatar,
  SimpleGrid,
  Select,
  Modal,
  Stack,
  PasswordInput,
  Checkbox,
  Badge,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { paymentService } from "@/lib/paymentService";
import { billService } from "@/lib/billService";
import { teamService } from "@/lib/teamService";
import PaymentModal from "@/components/ui/PaymentModal";
import BillingAddressFields from "@/components/ui/BillingAddressFields";
import { ManageTeams } from "@/app/teams/page";
import RefundRequestsList from "@/components/ui/RefundRequestsList";
import ProfileInvitesSection from "@/components/ui/ProfileInvitesSection";
import { productService } from "@/lib/productService";
import { organizationService } from "@/lib/organizationService";
import { boldsignService, SignStep } from "@/lib/boldsignService";
import { signedDocumentService } from "@/lib/signedDocumentService";
import {
  profileDocumentService,
  type ChildUnsignedDocumentCount,
  type ProfileDocumentCard,
} from "@/lib/profileDocumentService";
import {
  canViewerProxyChildSignature,
  isChildSignatureRestrictedToChildAccount,
} from "@/lib/profileDocumentAccess";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dateUtils";
import { selectBillOwnerTeams } from "@/lib/profileBilling";
import { resolveClientPublicOrigin } from "@/lib/clientPublicOrigin";
import { withSelectedProfileImage } from "./profileImageSelection";
import {
  Activity,
  CreditCard,
  FileCheck2,
  FolderKanban,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

const toDateInputValue = (value?: string | null): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
};

const toIsoDateValue = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const formatDobLabel = (value?: string | null): string => {
  const datePart = toDateInputValue(value);
  if (!datePart) return "Not provided";
  const date = new Date(`${datePart}T00:00:00Z`);
  return formatDisplayDate(date, { timeZone: "UTC", year: "numeric" });
};

const EMPTY_BILLING_ADDRESS: BillingAddress = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  countryCode: "US",
};

const normalizeBillingAddress = (
  value?: BillingAddress | null,
): BillingAddress => ({
  line1: value?.line1 ?? "",
  line2: value?.line2 ?? "",
  city: value?.city ?? "",
  state: normalizeUsStateCode(value?.state),
  postalCode: value?.postalCode ?? "",
  countryCode: normalizeBillingCountryCode(value?.countryCode),
});

const formatBillingAddressLabel = (value?: BillingAddress | null): string => {
  if (!value) {
    return "No billing address saved.";
  }

  const parts = [
    value.line1,
    value.line2,
    [value.city, value.state].filter(Boolean).join(", "),
    value.postalCode,
    value.countryCode,
  ]
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry));

  return parts.length ? parts.join(" • ") : "No billing address saved.";
};

const formatDateTimeLabel = (value?: string): string => {
  if (!value) return "Unknown date";
  const formatted = formatDisplayDateTime(value);
  return formatted || "Unknown date";
};

type ProfileViewTab =
  | "overview"
  | "social"
  | "family"
  | "documents"
  | "templates"
  | "billing";
type ProfileEditTab = "general" | "security";

type ProfileSidebarItemProps = {
  active: boolean;
  badge?: string;
  description: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
};

function ProfileSidebarItem({
  active,
  badge,
  description,
  icon: Icon,
  label,
  onClick,
}: ProfileSidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
        active
          ? "border-blue-300 bg-blue-600 text-white shadow-lg shadow-blue-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 rounded-xl p-2 ${
            active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="block text-sm font-semibold">{label}</span>
            {badge ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <p
            className={`mt-1 text-xs leading-5 ${active ? "text-blue-50" : "text-slate-500"}`}
          >
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authUser, loading, setUser, setAuthUser } = useApp();
  const { hideChatGroups } = useChat();
  const { closeChatWindow } = useChatUI();
  const [activeTab, setActiveTab] = useState<ProfileViewTab>("overview");
  const [editTab, setEditTab] = useState<ProfileEditTab>("general");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile form data
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    userName: "",
    dateOfBirth: "",
    profileImageId: "",
  });
  const [savedBillingAddress, setSavedBillingAddress] =
    useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [billingAddressData, setBillingAddressData] =
    useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [loadingBillingAddress, setLoadingBillingAddress] = useState(false);
  const [billingAddressError, setBillingAddressError] = useState<string | null>(
    null,
  );

  const [children, setChildren] = useState<FamilyChild[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<FamilyJoinRequest[]>([]);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
  const [joinRequestsError, setJoinRequestsError] = useState<string | null>(
    null,
  );
  const [resolvingJoinRequestId, setResolvingJoinRequestId] = useState<
    string | null
  >(null);
  const [socialGraph, setSocialGraph] = useState<UserSocialGraph | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialActionUserId, setSocialActionUserId] = useState<string | null>(
    null,
  );
  const [socialSearchQuery, setSocialSearchQuery] = useState("");
  const [socialSearchResults, setSocialSearchResults] = useState<UserData[]>(
    [],
  );
  const [socialSearchLoading, setSocialSearchLoading] = useState(false);
  const [socialSearchError, setSocialSearchError] = useState<string | null>(
    null,
  );
  const [creatingChild, setCreatingChild] = useState(false);
  const [updatingChild, setUpdatingChild] = useState(false);
  const [linkingChild, setLinkingChild] = useState(false);
  const [childFormError, setChildFormError] = useState<string | null>(null);
  const [linkFormError, setLinkFormError] = useState<string | null>(null);
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [editingChildUserId, setEditingChildUserId] = useState<string | null>(
    null,
  );
  const [childForm, setChildForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    dateOfBirth: "",
    relationship: "parent",
  });
  const [linkForm, setLinkForm] = useState({
    relationship: "parent",
  });
  const [linkChildSearchQuery, setLinkChildSearchQuery] = useState("");
  const [linkChildSearchResults, setLinkChildSearchResults] = useState<
    UserData[]
  >([]);
  const [linkChildSearchLoading, setLinkChildSearchLoading] = useState(false);
  const [selectedLinkChild, setSelectedLinkChild] = useState<UserData | null>(
    null,
  );

  // Account sections
  const [showEmailSection, setShowEmailSection] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [emailData, setEmailData] = useState({
    email: "",
    currentPassword: "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [managingStripe, setManagingStripe] = useState(false);
  type OwnedBill = Bill & { ownerLabel?: string };

  const [bills, setBills] = useState<OwnedBill[]>([]);
  const [userTeams, setUserTeams] = useState<Record<string, Team>>({});
  const [loadingBills, setLoadingBills] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);
  const [billPaymentData, setBillPaymentData] = useState<PaymentIntent | null>(
    null,
  );
  const [payingBill, setPayingBill] = useState<OwnedBill | null>(null);
  const [splittingBillId, setSplittingBillId] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [organizationsById, setOrganizationsById] = useState<
    Record<string, Organization>
  >({});
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const [cancellingSubId, setCancellingSubId] = useState<string | null>(null);
  const [restartingSubId, setRestartingSubId] = useState<string | null>(null);
  const [unsignedDocuments, setUnsignedDocuments] = useState<
    ProfileDocumentCard[]
  >([]);
  const [signedDocuments, setSignedDocuments] = useState<ProfileDocumentCard[]>(
    [],
  );
  const [childUnsignedCounts, setChildUnsignedCounts] = useState<
    ChildUnsignedDocumentCount[]
  >([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [eventTemplates, setEventTemplates] = useState<
    Array<{ id: string; name: string; start?: string; end?: string }>
  >([]);
  const [loadingEventTemplates, setLoadingEventTemplates] = useState(false);
  const [eventTemplatesError, setEventTemplatesError] = useState<string | null>(
    null,
  );
  const [selectedSignedTextDocument, setSelectedSignedTextDocument] =
    useState<ProfileDocumentCard | null>(null);
  const [activeSigningDocument, setActiveSigningDocument] =
    useState<ProfileDocumentCard | null>(null);
  const [showSignPasswordModal, setShowSignPasswordModal] = useState(false);
  const [signPassword, setSignPassword] = useState("");
  const [signPasswordError, setSignPasswordError] = useState<string | null>(
    null,
  );
  const [confirmingSignPassword, setConfirmingSignPassword] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signLinks, setSignLinks] = useState<SignStep[]>([]);
  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<
    string | null
  >(null);
  const [pendingSignatureOperationId, setPendingSignatureOperationId] =
    useState<string | null>(null);
  const [recordingSignature, setRecordingSignature] = useState(false);
  const [textAccepted, setTextAccepted] = useState(false);

  const userHasStripeAccount = Boolean(
    user?.hasStripeAccount || user?.stripeAccountId,
  );
  const isEditingChild = Boolean(editingChildUserId);
  const childFormSubmitting = creatingChild || updatingChild;
  const today = new Date();
  const maxDob = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const emailChangeStatus = searchParams.get("emailChange");
  const emailChangeMessage = searchParams.get("emailChangeMessage");

  // Initialize form data when user changes
  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        dateOfBirth: toDateInputValue(user.dateOfBirth),
        profileImageId: user.profileImageId || "",
      });
    }
  }, [user]);

  const loadBillingAddress = useCallback(async () => {
    if (!user?.$id) {
      setSavedBillingAddress(EMPTY_BILLING_ADDRESS);
      setBillingAddressData(EMPTY_BILLING_ADDRESS);
      setBillingAddressError(null);
      return;
    }

    setLoadingBillingAddress(true);
    setBillingAddressError(null);
    try {
      const profile = await billingAddressService.getBillingAddressProfile();
      const normalized = normalizeBillingAddress(profile.billingAddress);
      setSavedBillingAddress(normalized);
      setBillingAddressData(normalized);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load billing address.";
      setBillingAddressError(message);
      setSavedBillingAddress(EMPTY_BILLING_ADDRESS);
      setBillingAddressData(EMPTY_BILLING_ADDRESS);
    } finally {
      setLoadingBillingAddress(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    void loadBillingAddress();
  }, [loadBillingAddress]);

  useEffect(() => {
    if (!emailChangeStatus) return;

    const isSuccess = emailChangeStatus === "success";
    const fallbackMessage = isSuccess
      ? "Email updated successfully."
      : "Unable to update email. Please request another verification link.";
    const message = emailChangeMessage?.trim() || fallbackMessage;

    notifications.show({
      color: isSuccess ? "green" : "red",
      message,
    });

    if (isSuccess) {
      void authService
        .fetchSession()
        .then((session) => {
          setAuthUser(session.user);
        })
        .catch((refreshError) => {
          console.warn(
            "Failed to refresh auth session after email update",
            refreshError,
          );
        });
    }

    if (typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("emailChange");
      nextUrl.searchParams.delete("emailChangeMessage");
      window.history.replaceState({}, "", nextUrl.toString());
    }
  }, [emailChangeMessage, emailChangeStatus, setAuthUser]);

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel editing - reset to original values
      if (user) {
        setProfileData({
          firstName: user.firstName,
          lastName: user.lastName,
          userName: user.userName,
          dateOfBirth: toDateInputValue(user.dateOfBirth),
          profileImageId: user.profileImageId || "",
        });
      }
      setBillingAddressData(savedBillingAddress);
      setShowEmailSection(false);
      setShowPasswordSection(false);
      setEmailData({ email: "", currentPassword: "" });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } else {
      setEditTab("general");
    }
    setIsEditing(!isEditing);
    setError(null);
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      const normalizedDob = toIsoDateValue(profileData.dateOfBirth);
      if (!normalizedDob) {
        setError("Please provide a valid date of birth");
        return;
      }
      const normalizedBillingAddress = normalizeBillingAddress(
        billingAddressData,
      );
      if (
        !normalizedBillingAddress.line1.trim() ||
        !normalizedBillingAddress.city.trim() ||
        !normalizedBillingAddress.state.trim() ||
        !normalizedBillingAddress.postalCode.trim() ||
        !normalizedBillingAddress.countryCode.trim()
      ) {
        setError(
          "Billing address line 1, city, state, ZIP code, and country are required.",
        );
        return;
      }
      if (!isSupportedUsStateCode(normalizedBillingAddress.state)) {
        setError("Select a supported billing state.");
        return;
      }
      if (!isSupportedBillingCountryCode(normalizedBillingAddress.countryCode)) {
        setError("Only United States billing addresses are supported right now.");
        return;
      }

      const [profileResult, billingResult] = await Promise.allSettled([
        userService.updateProfile(user.$id, {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          userName: profileData.userName,
          dateOfBirth: normalizedDob,
          profileImageId: profileData.profileImageId,
        }),
        billingAddressService.saveBillingAddress({
          ...normalizedBillingAddress,
          line1: normalizedBillingAddress.line1.trim(),
          line2: normalizedBillingAddress.line2?.trim() || "",
          city: normalizedBillingAddress.city.trim(),
          state: normalizeUsStateCode(normalizedBillingAddress.state),
          postalCode: normalizedBillingAddress.postalCode.trim(),
          countryCode: normalizeBillingCountryCode(normalizedBillingAddress.countryCode),
        }),
      ]);

      const profileSucceeded = profileResult.status === "fulfilled";
      const billingSucceeded = billingResult.status === "fulfilled";

      if (profileSucceeded) {
        setUser(profileResult.value);
      }
      if (billingSucceeded) {
        const normalizedSavedAddress = normalizeBillingAddress(
          billingResult.value.billingAddress,
        );
        setSavedBillingAddress(normalizedSavedAddress);
        setBillingAddressData(normalizedSavedAddress);
        setBillingAddressError(null);
      }

      if (!profileSucceeded && !billingSucceeded) {
        const profileMessage =
          profileResult.reason instanceof Error
            ? profileResult.reason.message
            : "Failed to update profile.";
        const billingMessage =
          billingResult.reason instanceof Error
            ? billingResult.reason.message
            : "Failed to save billing address.";
        setError(`${profileMessage} ${billingMessage}`.trim());
        return;
      }

      if (!profileSucceeded) {
        const profileMessage =
          profileResult.reason instanceof Error
            ? profileResult.reason.message
            : "Failed to update profile.";
        setError(
          `Billing address saved, but profile details failed to update: ${profileMessage}`,
        );
        return;
      }

      if (!billingSucceeded) {
        const billingMessage =
          billingResult.reason instanceof Error
            ? billingResult.reason.message
            : "Failed to save billing address.";
        setError(
          `Profile updated, but billing address failed to save: ${billingMessage}`,
        );
        return;
      }

      setIsEditing(false);
      setShowEmailSection(false);
      setShowPasswordSection(false);
      setEmailData({ email: "", currentPassword: "" });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      setError(error.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const loadChildren = useCallback(async () => {
    setChildrenLoading(true);
    setChildrenError(null);
    try {
      const result = await familyService.listChildren();
      setChildren(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load children.";
      setChildrenError(message);
      setChildren([]);
    } finally {
      setChildrenLoading(false);
    }
  }, []);

  const loadJoinRequests = useCallback(async () => {
    setJoinRequestsLoading(true);
    setJoinRequestsError(null);
    try {
      const result = await familyService.listJoinRequests();
      setJoinRequests(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load child join requests.";
      setJoinRequestsError(message);
      setJoinRequests([]);
    } finally {
      setJoinRequestsLoading(false);
    }
  }, []);

  const loadSocialGraph = useCallback(async () => {
    setSocialLoading(true);
    setSocialError(null);
    try {
      const result = await userService.getSocialGraph();
      setSocialGraph(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load social connections.";
      setSocialError(message);
      setSocialGraph(null);
    } finally {
      setSocialLoading(false);
    }
  }, []);

  const searchSocialUsers = useCallback(
    async (query: string) => {
      setSocialSearchQuery(query);
      const trimmed = query.trim();

      if (trimmed.length < 2) {
        setSocialSearchResults([]);
        setSocialSearchError(null);
        setSocialSearchLoading(false);
        return;
      }

      setSocialSearchLoading(true);
      setSocialSearchError(null);
      try {
        const results = await userService.searchUsers(trimmed);
        setSocialSearchResults(
          results.filter((candidate) => candidate.$id !== user?.$id),
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to search users.";
        setSocialSearchError(message);
        setSocialSearchResults([]);
      } finally {
        setSocialSearchLoading(false);
      }
    },
    [user?.$id],
  );

  const runSocialAction = useCallback(
    async (
      targetUserId: string,
      action: (userId: string) => Promise<UserData>,
      successMessage: string,
    ) => {
      setSocialActionUserId(targetUserId);
      setSocialError(null);
      try {
        const updatedUser = await action(targetUserId);
        setUser(updatedUser);
        notifications.show({ color: "green", message: successMessage });
        await loadSocialGraph();
        if (socialSearchQuery.trim().length >= 2) {
          await searchSocialUsers(socialSearchQuery);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update connection.";
        setSocialError(message);
        notifications.show({ color: "red", message });
      } finally {
        setSocialActionUserId(null);
      }
    },
    [loadSocialGraph, searchSocialUsers, setUser, socialSearchQuery],
  );

  const runBlockAction = useCallback(
    async (targetUser: UserData, currentlyBlocked: boolean) => {
      const targetUserId = targetUser.$id;
      const targetName = getUserFullName(targetUser);
      setSocialActionUserId(targetUserId);
      setSocialError(null);
      try {
        if (currentlyBlocked) {
          const confirmed = window.confirm(`Unblock ${targetName}?`);
          if (!confirmed) {
            return;
          }

          const updatedUser = await userService.unblockUser(targetUserId);
          setUser(updatedUser);
          notifications.show({ color: "green", message: "User unblocked." });
        } else {
          const confirmed = window.confirm(
            `Block ${targetName}? This removes friendships, follows, and pending requests in both directions.`,
          );
          if (!confirmed) {
            return;
          }

          const leaveSharedChats = window.confirm(
            "Leave all chats with this user? Select OK to leave shared chats now, or Cancel to keep them.",
          );
          const result = await userService.blockUser(targetUserId, leaveSharedChats);
          setUser(result.user);
          if (result.removedChatIds.length > 0) {
            hideChatGroups(result.removedChatIds);
            result.removedChatIds.forEach((chatId) => closeChatWindow(chatId));
          }
          notifications.show({ color: "green", message: "User blocked." });
        }

        await loadSocialGraph();
        if (socialSearchQuery.trim().length >= 2) {
          await searchSocialUsers(socialSearchQuery);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update block state.";
        setSocialError(message);
        notifications.show({ color: "red", message });
      } finally {
        setSocialActionUserId(null);
      }
    },
    [
      closeChatWindow,
      hideChatGroups,
      loadSocialGraph,
      searchSocialUsers,
      setUser,
      socialSearchQuery,
    ],
  );

  useEffect(() => {
    if (user) {
      loadChildren();
      loadJoinRequests();
      loadSocialGraph();
    }
  }, [user, loadChildren, loadJoinRequests, loadSocialGraph]);

  const resetChildForm = () => {
    setChildForm({
      firstName: "",
      lastName: "",
      email: "",
      dateOfBirth: "",
      relationship: "parent",
    });
    setEditingChildUserId(null);
    setChildFormError(null);
  };

  const resetLinkChildForm = () => {
    setLinkForm({ relationship: "parent" });
    setLinkChildSearchQuery("");
    setLinkChildSearchResults([]);
    setSelectedLinkChild(null);
    setLinkFormError(null);
  };

  const searchChildCandidates = useCallback(
    async (query: string) => {
      setLinkChildSearchQuery(query);
      const trimmed = query.trim();

      if (trimmed.length < 2) {
        setLinkChildSearchResults([]);
        setLinkChildSearchLoading(false);
        setLinkFormError(null);
        return;
      }

      setLinkChildSearchLoading(true);
      setLinkFormError(null);
      try {
        const existingChildIds = new Set(children.map((child) => child.userId));
        const results = await userService.searchUsers(trimmed);
        const filtered = results.filter((candidate) => {
          if (candidate.$id === user?.$id) return false;
          if (existingChildIds.has(candidate.$id)) return false;
          return true;
        });
        setLinkChildSearchResults(filtered);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to search users.";
        setLinkFormError(message);
        setLinkChildSearchResults([]);
      } finally {
        setLinkChildSearchLoading(false);
      }
    },
    [children, user?.$id],
  );

  const handleToggleChildForms = () => {
    if (showAddChildForm) {
      resetChildForm();
      resetLinkChildForm();
      setShowAddChildForm(false);
      return;
    }

    resetChildForm();
    resetLinkChildForm();
    setShowAddChildForm(true);
  };

  const handleEditChild = (child: FamilyChild) => {
    setChildForm({
      firstName: child.firstName || "",
      lastName: child.lastName || "",
      email: child.email || "",
      dateOfBirth: toDateInputValue(child.dateOfBirth),
      relationship: child.relationship || "parent",
    });
    setEditingChildUserId(child.userId);
    setChildFormError(null);
    resetLinkChildForm();
    setShowAddChildForm(true);
  };

  const handleCancelChildForm = () => {
    resetChildForm();
  };

  const handleSaveChild = async () => {
    if (
      !childForm.firstName.trim() ||
      !childForm.lastName.trim() ||
      !childForm.dateOfBirth.trim()
    ) {
      setChildFormError(
        "First name, last name, and date of birth are required.",
      );
      return;
    }

    const payload = {
      firstName: childForm.firstName.trim(),
      lastName: childForm.lastName.trim(),
      email: childForm.email.trim() || undefined,
      dateOfBirth: childForm.dateOfBirth.trim(),
      relationship: childForm.relationship,
    };

    setChildFormError(null);

    if (editingChildUserId) {
      setUpdatingChild(true);
      try {
        await familyService.updateChildAccount({
          childUserId: editingChildUserId,
          ...payload,
        });
        resetChildForm();
        await Promise.all([
          loadChildren(),
          loadJoinRequests(),
          loadDocuments(),
        ]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update child.";
        setChildFormError(message);
      } finally {
        setUpdatingChild(false);
      }
      return;
    }

    setCreatingChild(true);
    try {
      await familyService.createChildAccount(payload);
      resetChildForm();
      await Promise.all([loadChildren(), loadJoinRequests()]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create child.";
      setChildFormError(message);
    } finally {
      setCreatingChild(false);
    }
  };

  const handleLinkChild = async () => {
    if (!selectedLinkChild?.$id) {
      setLinkFormError("Select a child account from search results.");
      return;
    }
    setLinkingChild(true);
    setLinkFormError(null);
    try {
      await familyService.linkChildToParent({
        childUserId: selectedLinkChild.$id,
        relationship: linkForm.relationship,
      });
      resetLinkChildForm();
      await Promise.all([loadChildren(), loadJoinRequests()]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to link child.";
      setLinkFormError(message);
    } finally {
      setLinkingChild(false);
    }
  };

  const handleImageUploaded = (fileId: string, imageUrl: string) => {
    setProfileData((prev) => withSelectedProfileImage(prev, fileId, imageUrl));
  };

  const handleEmailUpdate = async () => {
    const normalizedEmail = emailData.email.trim().toLowerCase();
    if (!normalizedEmail || !emailData.currentPassword) return;

    if (authUser?.email?.trim().toLowerCase() === normalizedEmail) {
      setError("New email must be different from your current email.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await userService.updateEmail(normalizedEmail, emailData.currentPassword);
      setEmailData({ email: "", currentPassword: "" });
      setShowEmailSection(false);
      notifications.show({
        color: "blue",
        message:
          "Verification email sent. Open the link in your new inbox to finish updating your email.",
      });
    } catch (error: any) {
      setError(error.message || "Failed to update email");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword) return;

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setSaving(true);
    try {
      await userService.updatePassword(
        passwordData.currentPassword,
        passwordData.newPassword,
      );
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordSection(false);
      alert("Password updated successfully");
    } catch (error: any) {
      setError(error.message || "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  const handleConnectStripeAccount = useCallback(async () => {
    if (!user) return;
    if (typeof window === "undefined") {
      notifications.show({
        color: "red",
        message: "Stripe onboarding is only available in the browser.",
      });
      return;
    }
    try {
      setConnectingStripe(true);
      const origin = resolveClientPublicOrigin();
      if (!origin) {
        notifications.show({
          color: "red",
          message: "Unable to determine public URL for Stripe onboarding.",
        });
        return;
      }
      const refreshUrl = `${origin}/profile?stripe=refresh`;
      const returnUrl = `${origin}/profile?stripe=return`;
      const result = await paymentService.connectStripeAccount({
        user,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, "_blank", "noopener,noreferrer");
      } else {
        notifications.show({
          color: "red",
          message: "Stripe onboarding did not return a link. Try again later.",
        });
      }
    } catch (err) {
      console.error("Failed to connect Stripe account:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to start Stripe onboarding right now.";
      notifications.show({ color: "red", message });
    } finally {
      setConnectingStripe(false);
    }
  }, [user]);

  const handleManageStripeAccount = useCallback(async () => {
    if (!user) return;
    if (typeof window === "undefined") {
      notifications.show({
        color: "red",
        message: "Stripe account management is only available in the browser.",
      });
      return;
    }
    try {
      setManagingStripe(true);
      const origin = resolveClientPublicOrigin();
      if (!origin) {
        notifications.show({
          color: "red",
          message: "Unable to determine public URL for Stripe management.",
        });
        return;
      }
      const refreshUrl = `${origin}/profile?stripe=refresh`;
      const returnUrl = `${origin}/profile?stripe=return`;
      const result = await paymentService.manageStripeAccount({
        user,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, "_blank", "noopener,noreferrer");
      } else {
        notifications.show({
          color: "red",
          message: "Stripe did not return a management link. Try again later.",
        });
      }
    } catch (err) {
      console.error("Failed to manage Stripe account:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Unable to open Stripe management right now.";
      notifications.show({ color: "red", message });
    } finally {
      setManagingStripe(false);
    }
  }, [user]);

  const loadBills = useCallback(async () => {
    if (!user) return;
    setLoadingBills(true);
    setBillError(null);
    try {
      const [userBills, fetchedTeams] = await Promise.all([
        billService.listBills("USER", user.$id),
        teamService.getTeamsByUserId(user.$id),
      ]);

      const billOwnerTeams = selectBillOwnerTeams(fetchedTeams, user.$id);
      const teamsMap = Object.fromEntries(
        fetchedTeams.map((team) => [team.$id, team]),
      );
      const teamBillsNested = await Promise.all(
        billOwnerTeams.map(async (team) => {
          try {
            const billsForTeam = await billService.listBills("TEAM", team.$id);
            return billsForTeam.map((bill) => ({
              ...bill,
              ownerLabel: team.name,
            }));
          } catch (err) {
            console.error(`Failed to load bills for team ${team.$id}`, err);
            return [];
          }
        }),
      );

      const ownedBills: OwnedBill[] = [
        ...userBills.map((bill) => ({ ...bill, ownerLabel: user.fullName })),
        ...teamBillsNested.flat(),
      ];

      setBills(ownedBills);
      setUserTeams(teamsMap);
    } catch (err) {
      setBillError(err instanceof Error ? err.message : "Failed to load bills");
    } finally {
      setLoadingBills(false);
    }
  }, [user]);

  const handlePayBill = useCallback(
    async (bill: Bill) => {
      if (!user) return;
      try {
        setBillError(null);
        const paymentIntent = await billService.payBill(bill, user);
        setBillPaymentData(paymentIntent);
        setPayingBill(bill);
      } catch (err) {
        setBillError(
          err instanceof Error ? err.message : "Failed to start payment",
        );
      }
    },
    [user],
  );

  const handleSplitBill = useCallback(
    async (bill: OwnedBill) => {
      if (bill.ownerType !== "TEAM" || !bill.allowSplit) return;
      const team = userTeams[bill.ownerId];
      if (!team) {
        notifications.show({
          color: "red",
          message: "Unable to load team details for this bill.",
        });
        return;
      }
      if (!team.playerIds || team.playerIds.length === 0) {
        notifications.show({
          color: "red",
          message: "Team has no players to split this bill.",
        });
        return;
      }
      try {
        setSplittingBillId(bill.$id);
        await billService.splitBill(bill.$id, team.playerIds);
        notifications.show({
          color: "green",
          message: "Bill split across the team.",
        });
        await loadBills();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to split bill";
        notifications.show({ color: "red", message });
      } finally {
        setSplittingBillId(null);
      }
    },
    [userTeams, loadBills],
  );

  const closeBillPaymentModal = useCallback(() => {
    setBillPaymentData(null);
    setPayingBill(null);
  }, []);

  const loadSubscriptions = useCallback(async () => {
    if (!user) return;
    setLoadingSubscriptions(true);
    setSubscriptionError(null);
    try {
      const subs = await userService.listUserSubscriptions(user.$id);
      setSubscriptions(subs);

      const productIds = Array.from(
        new Set(subs.map((sub) => sub.productId).filter(Boolean)),
      );
      const organizationIds = Array.from(
        new Set(
          subs
            .map((sub) => sub.organizationId)
            .filter(
              (orgId): orgId is string =>
                typeof orgId === "string" && Boolean(orgId),
            ),
        ),
      );

      const [products, organizations] = await Promise.all([
        productIds.length
          ? productService.getProductsByIds(productIds)
          : Promise.resolve([]),
        organizationIds.length
          ? organizationService.getOrganizationsByIds(organizationIds)
          : Promise.resolve([]),
      ]);

      if (products.length) {
        setProductsById((prev) => ({
          ...prev,
          ...Object.fromEntries(
            products.map((product) => [product.$id, product]),
          ),
        }));
      }

      if (organizations.length) {
        setOrganizationsById((prev) => ({
          ...prev,
          ...Object.fromEntries(
            organizations.map((organization) => [
              organization.$id,
              organization,
            ]),
          ),
        }));
      }
    } catch (err) {
      setSubscriptionError(
        err instanceof Error ? err.message : "Failed to load memberships",
      );
    } finally {
      setLoadingSubscriptions(false);
    }
  }, [user]);

  const handleCancelSubscription = useCallback(
    async (subscriptionId: string) => {
      if (!subscriptionId) return;
      try {
        setCancellingSubId(subscriptionId);
        const cancelled =
          await productService.cancelSubscription(subscriptionId);
        if (cancelled) {
          notifications.show({
            color: "green",
            message: "Membership cancelled.",
          });
          await loadSubscriptions();
        } else {
          notifications.show({
            color: "red",
            message: "Unable to cancel membership. Try again.",
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel membership";
        notifications.show({ color: "red", message });
      } finally {
        setCancellingSubId(null);
      }
    },
    [loadSubscriptions],
  );

  const handleRestartSubscription = useCallback(
    async (subscriptionId: string) => {
      if (!subscriptionId) return;
      try {
        setRestartingSubId(subscriptionId);
        const restarted =
          await productService.restartSubscription(subscriptionId);
        if (restarted) {
          notifications.show({
            color: "green",
            message: "Membership restarted.",
          });
          await loadSubscriptions();
        } else {
          notifications.show({
            color: "red",
            message: "Unable to restart membership. Try again.",
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to restart membership";
        notifications.show({ color: "red", message });
      } finally {
        setRestartingSubId(null);
      }
    },
    [loadSubscriptions],
  );

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    setLoadingDocuments(true);
    setDocumentsError(null);
    try {
      const result = await profileDocumentService.listDocuments();
      setUnsignedDocuments(result.unsigned);
      setSignedDocuments(result.signed);
      setChildUnsignedCounts(result.childUnsignedCounts);
    } catch (err) {
      setDocumentsError(
        err instanceof Error ? err.message : "Failed to load documents.",
      );
      setUnsignedDocuments([]);
      setSignedDocuments([]);
      setChildUnsignedCounts([]);
    } finally {
      setLoadingDocuments(false);
    }
  }, [user]);

  const loadEventTemplates = useCallback(async () => {
    if (!user) return;
    setLoadingEventTemplates(true);
    setEventTemplatesError(null);
    try {
      const params = new URLSearchParams();
      params.set("state", "TEMPLATE");
      params.set("limit", "100");
      const response = await fetch(`/api/events?${params.toString()}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load event templates.");
      }
      const rows = Array.isArray(payload?.events) ? payload.events : [];
      setEventTemplates(
        rows
          .map((row: Record<string, any>) => ({
            id: String(row?.$id ?? row?.id ?? ""),
            name: String(row?.name ?? "Untitled Template"),
            start: typeof row?.start === "string" ? row.start : undefined,
            end: typeof row?.end === "string" ? row.end : undefined,
          }))
          .filter((row: { id: string }) => row.id.length > 0),
      );
    } catch (err) {
      setEventTemplatesError(
        err instanceof Error ? err.message : "Failed to load event templates.",
      );
      setEventTemplates([]);
    } finally {
      setLoadingEventTemplates(false);
    }
  }, [user]);

  const handleResolveJoinRequest = useCallback(
    async (registrationId: string, action: "approve" | "decline") => {
      if (!registrationId) return;
      setResolvingJoinRequestId(registrationId);
      setJoinRequestsError(null);
      try {
        const result = await familyService.resolveJoinRequest(
          registrationId,
          action,
        );
        if (Array.isArray(result.warnings) && result.warnings.length > 0) {
          notifications.show({ color: "yellow", message: result.warnings[0] });
        } else {
          notifications.show({
            color: "green",
            message:
              action === "approve"
                ? "Join request approved."
                : "Join request declined.",
          });
        }
        await Promise.all([
          loadJoinRequests(),
          loadChildren(),
          loadDocuments(),
        ]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update join request.";
        setJoinRequestsError(message);
        notifications.show({ color: "red", message });
      } finally {
        setResolvingJoinRequestId(null);
      }
    },
    [loadChildren, loadDocuments, loadJoinRequests],
  );

  const resetSigningState = useCallback(() => {
    setShowSignPasswordModal(false);
    setSignPassword("");
    setSignPasswordError(null);
    setShowSignModal(false);
    setSignLinks([]);
    setCurrentSignIndex(0);
    setPendingSignedDocumentId(null);
    setPendingSignatureOperationId(null);
    setRecordingSignature(false);
    setTextAccepted(false);
    setActiveSigningDocument(null);
  }, []);

  const handleOpenSignedDocument = useCallback(
    (document: ProfileDocumentCard) => {
      if (document.type === "PDF" && document.viewUrl) {
        if (typeof window !== "undefined") {
          window.open(document.viewUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }
      setSelectedSignedTextDocument(document);
    },
    [],
  );

  const handleStartSigningDocument = useCallback(
    (document: ProfileDocumentCard) => {
      if (!user) return;
      if (!document.eventId && !document.teamId) {
        setDocumentsError(
          "Cannot sign this document because the source record is missing.",
        );
        return;
      }
      const childMustSignFromOwnAccount =
        isChildSignatureRestrictedToChildAccount({
          signerContext: document.signerContext,
          viewerUserId: user.$id,
          childUserId: document.childUserId,
          childEmail: document.childEmail,
        });
      const viewerCanProxyChildSignature = canViewerProxyChildSignature({
        signerContext: document.signerContext,
        viewerUserId: user.$id,
        childUserId: document.childUserId,
        childEmail: document.childEmail,
      });
      if (childMustSignFromOwnAccount) {
        setDocumentsError(
          "This signature must be completed from the child account.",
        );
        return;
      }
      if (document.requiresChildEmail && !viewerCanProxyChildSignature) {
        setDocumentsError(
          document.statusNote ||
            "Add child email before starting this child-signature document.",
        );
        return;
      }
      if (!authUser?.email) {
        setDocumentsError("Sign-in email is required to sign documents.");
        return;
      }
      setDocumentsError(null);
      setActiveSigningDocument(document);
      setSignPassword("");
      setSignPasswordError(null);
      setShowSignPasswordModal(true);
    },
    [authUser?.email, user],
  );

  const confirmPasswordAndStartSigning = useCallback(async () => {
    if (
      !activeSigningDocument ||
      !user ||
      !authUser?.email
    ) {
      return;
    }
    if (!signPassword.trim()) {
      setSignPasswordError("Password is required.");
      return;
    }
    setConfirmingSignPassword(true);
    setSignPasswordError(null);
    try {
      const response = await fetch("/api/documents/confirm-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authUser.email,
          password: signPassword,
          eventId: activeSigningDocument.eventId,
          teamId: activeSigningDocument.teamId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Password confirmation failed.");
      }

      const links = await boldsignService.createSignLinks({
        eventId: activeSigningDocument.eventId,
        teamId: activeSigningDocument.teamId,
        user,
        userEmail: authUser.email,
        templateId: activeSigningDocument.templateId,
        signerContext: activeSigningDocument.signerContext,
        childUserId: activeSigningDocument.childUserId,
        childEmail: activeSigningDocument.childEmail,
      });

      if (!links.length) {
        resetSigningState();
        await loadDocuments();
        notifications.show({
          color: "yellow",
          message: "No unsigned signature step was returned for this document.",
        });
        return;
      }

      setSignLinks(links);
      setCurrentSignIndex(0);
      setPendingSignedDocumentId(null);
      setPendingSignatureOperationId(null);
      setSignPassword("");
      setShowSignPasswordModal(false);
      setShowSignModal(true);
    } catch (error) {
      setSignPasswordError(
        error instanceof Error ? error.message : "Failed to confirm password.",
      );
    } finally {
      setConfirmingSignPassword(false);
    }
  }, [
    activeSigningDocument,
    authUser?.email,
    loadDocuments,
    resetSigningState,
    signPassword,
    user,
  ]);

  const recordSignature = useCallback(
    async (payload: {
      templateId: string;
      documentId: string;
      type: SignStep["type"];
    }): Promise<{ operationId?: string; syncStatus?: string }> => {
      if ((!activeSigningDocument?.eventId && !activeSigningDocument?.teamId) || !user) {
        throw new Error("A signing source and user are required to record signatures.");
      }
      const signingUserId =
        activeSigningDocument.signerContext === "child" &&
        activeSigningDocument.childUserId
          ? activeSigningDocument.childUserId
          : user.$id;
      const response = await fetch("/api/documents/record-signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: payload.templateId,
          documentId: payload.documentId,
          eventId: activeSigningDocument.eventId,
          teamId: activeSigningDocument.teamId,
          type: payload.type,
          userId: signingUserId,
          childUserId: activeSigningDocument.childUserId,
          signerContext: activeSigningDocument.signerContext,
          user,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.error) {
        throw new Error(result?.error || "Failed to record signature.");
      }
      return {
        operationId:
          typeof result?.operationId === "string"
            ? result.operationId
            : undefined,
        syncStatus:
          typeof result?.syncStatus === "string"
            ? result.syncStatus
            : undefined,
      };
    },
    [activeSigningDocument, user],
  );

  const handleSignedDocument = useCallback(
    async (messageDocumentId?: string) => {
      const currentLink = signLinks[currentSignIndex];
      if (!currentLink || currentLink.type === "TEXT") {
        return;
      }
      if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
        return;
      }
      if (
        pendingSignedDocumentId ||
        pendingSignatureOperationId ||
        recordingSignature
      ) {
        return;
      }
      if (!currentLink.documentId) {
        setDocumentsError("Missing document identifier for signature.");
        return;
      }

      setRecordingSignature(true);
      try {
        const signatureResult = await recordSignature({
          templateId: currentLink.templateId,
          documentId: currentLink.documentId,
          type: currentLink.type,
        });
        setShowSignModal(false);
        setPendingSignedDocumentId(currentLink.documentId);
        setPendingSignatureOperationId(
          signatureResult.operationId || currentLink.operationId || null,
        );
      } catch (error) {
        setDocumentsError(
          error instanceof Error
            ? error.message
            : "Failed to record signature.",
        );
        resetSigningState();
      } finally {
        setRecordingSignature(false);
      }
    },
    [
      currentSignIndex,
      pendingSignatureOperationId,
      pendingSignedDocumentId,
      recordSignature,
      recordingSignature,
      resetSigningState,
      signLinks,
    ],
  );

  const handleTextAcceptance = useCallback(async () => {
    const currentLink = signLinks[currentSignIndex];
    if (!currentLink || currentLink.type !== "TEXT") {
      return;
    }
    if (
      !textAccepted ||
      pendingSignedDocumentId ||
      pendingSignatureOperationId ||
      recordingSignature
    ) {
      return;
    }

    const documentId =
      currentLink.documentId ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    setRecordingSignature(true);
    try {
      const signatureResult = await recordSignature({
        templateId: currentLink.templateId,
        documentId,
        type: currentLink.type,
      });
      setShowSignModal(false);
      setPendingSignedDocumentId(documentId);
      setPendingSignatureOperationId(
        signatureResult.operationId || currentLink.operationId || null,
      );
    } catch (error) {
      setDocumentsError(
        error instanceof Error ? error.message : "Failed to record signature.",
      );
      resetSigningState();
    } finally {
      setRecordingSignature(false);
    }
  }, [
    currentSignIndex,
    pendingSignatureOperationId,
    pendingSignedDocumentId,
    recordSignature,
    recordingSignature,
    resetSigningState,
    signLinks,
    textAccepted,
  ]);

  useEffect(() => {
    setTextAccepted(false);
  }, [currentSignIndex, signLinks]);

  useEffect(() => {
    if (!showSignModal) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (
        typeof event.origin === "string" &&
        !event.origin.includes("boldsign")
      ) {
        return;
      }
      const payload = event.data;
      let eventName = "";
      if (typeof payload === "string") {
        eventName = payload;
      } else if (payload && typeof payload === "object") {
        eventName =
          payload.event ||
          payload.eventName ||
          payload.type ||
          payload.name ||
          "";
      }
      const eventLabel = eventName.toString();
      if (
        !eventLabel ||
        (!eventLabel.includes("onDocumentSigned") &&
          !eventLabel.includes("documentSigned"))
      ) {
        return;
      }

      const documentId =
        (payload &&
          typeof payload === "object" &&
          (payload.documentId || payload.documentID)) ||
        undefined;
      void handleSignedDocument(
        typeof documentId === "string" ? documentId : undefined,
      );
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [handleSignedDocument, showSignModal]);

  useEffect(() => {
    if (!pendingSignatureOperationId) {
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const intervalMs = 1500;
    const timeoutMs = 90_000;

    const poll = async () => {
      try {
        const operation = await boldsignService.getOperationStatus(
          pendingSignatureOperationId,
        );
        if (cancelled) {
          return;
        }

        const status = String(operation.status ?? "").toUpperCase();
        if (status === "CONFIRMED") {
          const nextIndex = currentSignIndex + 1;
          if (nextIndex < signLinks.length) {
            setCurrentSignIndex(nextIndex);
            setPendingSignedDocumentId(null);
            setPendingSignatureOperationId(null);
            setShowSignModal(true);
            return;
          }

          resetSigningState();
          await loadDocuments();
          notifications.show({ color: "green", message: "Document signed." });
          return;
        }

        if (
          status === "FAILED" ||
          status === "FAILED_RETRYABLE" ||
          status === "TIMED_OUT"
        ) {
          throw new Error(
            operation.error || "Failed to synchronize signature status.",
          );
        }

        if (Date.now() - startedAt > timeoutMs) {
          throw new Error(
            "Signature sync is delayed. Please try again shortly.",
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setDocumentsError(
          error instanceof Error
            ? error.message
            : "Failed to confirm signature.",
        );
        resetSigningState();
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, intervalMs);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    currentSignIndex,
    loadDocuments,
    pendingSignatureOperationId,
    resetSigningState,
    signLinks.length,
  ]);

  useEffect(() => {
    if (!pendingSignedDocumentId) {
      return;
    }
    if (pendingSignatureOperationId) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const signingUserId =
          activeSigningDocument?.signerContext === "child" &&
          activeSigningDocument?.childUserId
            ? activeSigningDocument.childUserId
            : user?.$id;
        const signed = await signedDocumentService.isDocumentSigned(
          pendingSignedDocumentId,
          signingUserId,
        );
        if (!signed || cancelled) {
          return;
        }

        const nextIndex = currentSignIndex + 1;
        if (nextIndex < signLinks.length) {
          setCurrentSignIndex(nextIndex);
          setPendingSignedDocumentId(null);
          setShowSignModal(true);
          return;
        }

        resetSigningState();
        await loadDocuments();
        notifications.show({ color: "green", message: "Document signed." });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setDocumentsError(
          error instanceof Error
            ? error.message
            : "Failed to confirm signature.",
        );
        resetSigningState();
      }
    };

    const interval = window.setInterval(poll, 1000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeSigningDocument,
    currentSignIndex,
    loadDocuments,
    pendingSignatureOperationId,
    pendingSignedDocumentId,
    resetSigningState,
    signLinks,
    user?.$id,
  ]);

  useEffect(() => {
    if (user) {
      loadBills();
      loadSubscriptions();
      loadDocuments();
      loadEventTemplates();
    }
  }, [user, loadBills, loadSubscriptions, loadDocuments, loadEventTemplates]);

  const childNameById = useMemo(() => {
    const next = new Map<string, string>();
    children.forEach((child) => {
      const childId = (child.userId || "").trim();
      if (!childId) {
        return;
      }
      const displayName =
        `${child.firstName || ""} ${child.lastName || ""}`.trim();
      if (displayName) {
        next.set(childId, displayName);
      }
    });
    return next;
  }, [children]);
  const childUnsignedCountById = useMemo(() => {
    const next = new Map<string, number>();
    childUnsignedCounts.forEach((row) => {
      const childUserId = (row.childUserId || "").trim();
      if (!childUserId) {
        return;
      }
      const current = next.get(childUserId) ?? 0;
      const unsignedCount = Number.isFinite(row.unsignedCount)
        ? Math.max(0, row.unsignedCount)
        : 0;
      next.set(childUserId, current + unsignedCount);
    });
    return next;
  }, [childUnsignedCounts]);
  const visibleUnsignedDocuments = useMemo(
    () =>
      unsignedDocuments.filter((document) => {
        if (!user) {
          return false;
        }
        const childMustSignFromOwnAccount =
          isChildSignatureRestrictedToChildAccount({
            signerContext: document.signerContext,
            viewerUserId: user.$id,
            childUserId: document.childUserId,
            childEmail: document.childEmail,
          });
        const viewerCanProxyChildSignature = canViewerProxyChildSignature({
          signerContext: document.signerContext,
          viewerUserId: user.$id,
          childUserId: document.childUserId,
          childEmail: document.childEmail,
        });
        return !childMustSignFromOwnAccount || viewerCanProxyChildSignature;
      }),
    [unsignedDocuments, user],
  );

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Please log in to view your profile.</p>
      </div>
    );
  }

  const profileImagePreviewUrl = profileData.profileImageId
    ? `/api/files/${profileData.profileImageId}/preview?w=128&h=128&fit=cover`
    : getUserAvatarUrl(user, 128);
  const memberSinceLabel = user.$createdAt
    ? formatDisplayDate(user.$createdAt)
    : "Unknown";
  const pendingBillsCount = bills.filter((bill) => {
    const remaining = Math.max(bill.totalAmountCents - bill.paidAmountCents, 0);
    const nextAmount =
      bill.nextPaymentAmountCents !== null &&
      bill.nextPaymentAmountCents !== undefined
        ? bill.nextPaymentAmountCents
        : remaining;
    return nextAmount > 0;
  }).length;
  const activeMembershipCount = subscriptions.filter(
    (sub) => (sub.status || "ACTIVE") !== "CANCELLED",
  ).length;
  const totalChildUnsignedCount = childUnsignedCounts.reduce(
    (sum, row) =>
      sum +
      (Number.isFinite(row.unsignedCount) ? Math.max(0, row.unsignedCount) : 0),
    0,
  );
  const currentEmail = authUser?.email || "Not available";
  const displayName =
    `${isEditing ? profileData.firstName : user.firstName} ${isEditing ? profileData.lastName : user.lastName}`.trim() ||
    user.fullName;
  const displayHandle = isEditing ? profileData.userName : user.userName;
  const viewNavigationItems: Array<{
    badge?: string;
    description: string;
    icon: LucideIcon;
    id: ProfileViewTab;
    label: string;
  }> = [
    {
      id: "overview",
      label: "Overview",
      description: "Invites, teams, and account summary.",
      icon: Activity,
    },
    {
      id: "social",
      label: "Connections",
      description: "Friends, follows, and requests.",
      icon: UsersRound,
      badge: socialGraph?.incomingFriendRequests.length
        ? String(socialGraph.incomingFriendRequests.length)
        : undefined,
    },
    {
      id: "family",
      label: "Family",
      description: "Children, guardians, and consent.",
      icon: UserRound,
      badge: joinRequests.length ? String(joinRequests.length) : undefined,
    },
    {
      id: "documents",
      label: "Documents",
      description: "Unsigned waivers and signed records.",
      icon: FileCheck2,
      badge: visibleUnsignedDocuments.length
        ? String(visibleUnsignedDocuments.length)
        : undefined,
    },
    {
      id: "templates",
      label: "Templates",
      description: "Reusable personal event blueprints.",
      icon: FolderKanban,
      badge: eventTemplates.length ? String(eventTemplates.length) : undefined,
    },
    {
      id: "billing",
      label: "Billing",
      description: "Payments, memberships, and refunds.",
      icon: CreditCard,
      badge: pendingBillsCount ? String(pendingBillsCount) : undefined,
    },
  ];
  const editNavigationItems: Array<{
    description: string;
    icon: LucideIcon;
    id: ProfileEditTab;
    label: string;
  }> = [
    {
      id: "general",
      label: "General info",
      description: "Name, handle, birth date, and profile photo.",
      icon: UserRound,
    },
    {
      id: "security",
      label: "Account security",
      description: "Email verification and password updates.",
      icon: LockKeyhole,
    },
  ];

  const renderOverviewTab = () => (
    <div className="space-y-6">
      <Paper withBorder radius="xl" p="lg" shadow="sm">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Title order={4}>Billing address</Title>
            <Text size="sm" c="dimmed" mt="xs">
              Used for tax calculation and payment checkout.
            </Text>
          </div>
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setIsEditing(true);
              setEditTab("general");
            }}
          >
            Edit
          </Button>
        </Group>
        {billingAddressError ? (
          <Alert color="red" mt="md">
            {billingAddressError}
          </Alert>
        ) : loadingBillingAddress ? (
          <Text c="dimmed" size="sm" mt="md">
            Loading billing address...
          </Text>
        ) : (
          <Text mt="md">{formatBillingAddressLabel(savedBillingAddress)}</Text>
        )}
      </Paper>

      <Paper withBorder radius="xl" p="lg" shadow="sm">
        <ProfileInvitesSection userId={user.$id} />
      </Paper>

      <Paper withBorder radius="xl" p="lg" shadow="sm">
        <Suspense fallback={<Loading text="Loading teams..." />}>
          <ManageTeams showNavigation={false} withContainer={false} />
        </Suspense>
      </Paper>
    </div>
  );

  const renderSocialPeopleList = (
    title: string,
    loadingLabel: string,
    emptyLabel: string,
    content: React.ReactNode,
  ) => (
    <Paper withBorder radius="xl" p="lg" shadow="sm">
      <Title order={5} mb="sm">
        {title}
      </Title>
      {socialLoading ? (
        <Text c="dimmed" size="sm">
          {loadingLabel}
        </Text>
      ) : (
        content || (
          <Text c="dimmed" size="sm">
            {emptyLabel}
          </Text>
        )
      )}
    </Paper>
  );

  const renderSocialTab = () => (
    <div className="space-y-6">
      <Paper withBorder radius="xl" p="xl" shadow="sm">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Badge variant="light" color="blue" radius="xl">
              Connections
            </Badge>
            <Title order={3} mt="md">
              People around your account
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              Manage friend requests, followers, and the people you follow.
            </Text>
          </div>
          <Button
            variant="light"
            size="xs"
            onClick={() => {
              void loadSocialGraph();
            }}
            loading={socialLoading}
          >
            Refresh
          </Button>
        </Group>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Friends
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {socialGraph?.friends.length ?? 0}
            </Text>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Following
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {socialGraph?.following.length ?? 0}
            </Text>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Followers
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {socialGraph?.followers.length ?? 0}
            </Text>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Requests
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {socialGraph?.incomingFriendRequests.length ?? 0}
            </Text>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Blocked
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {socialGraph?.blocked.length ?? 0}
            </Text>
          </div>
        </div>
      </Paper>

      {socialError && <Alert color="red">{socialError}</Alert>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)]">
        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <Title order={5}>Find people</Title>
          <Text size="sm" c="dimmed" mt="xs" mb="md">
            Search by name or username and manage friend/follow actions directly
            from results.
          </Text>
          <TextInput
            placeholder="Search by name or username"
            value={socialSearchQuery}
            onChange={(event) => {
              const value = event.currentTarget.value;
              void searchSocialUsers(value);
            }}
          />
          {socialSearchError && (
            <Alert color="red" variant="light" mt="md">
              {socialSearchError}
            </Alert>
          )}
          <div className="mt-4 space-y-3">
            {socialSearchLoading ? (
              <Text c="dimmed" size="sm">
                Searching...
              </Text>
            ) : socialSearchQuery.trim().length < 2 ? (
              <Text c="dimmed" size="sm">
                Enter at least 2 characters to search.
              </Text>
            ) : socialSearchResults.length === 0 ? (
              <Text c="dimmed" size="sm">
                No users found.
              </Text>
            ) : (
              socialSearchResults.map((candidate) => {
                const candidateId = candidate.$id;
                const isFriend = user.friendIds.includes(candidateId);
                const isFollowing = user.followingIds.includes(candidateId);
                const hasIncomingRequest =
                  user.friendRequestIds.includes(candidateId);
                const hasOutgoingRequest =
                  user.friendRequestSentIds.includes(candidateId);
                const isBlocked = user.blockedUserIds.includes(candidateId);
                const isActing = socialActionUserId === candidateId;
                const isRestricted =
                  isUserSocialInteractionRestricted(candidate);
                const candidateDisplayName = getUserFullName(candidate);
                const candidateHandle = getUserHandle(candidate);
                const followDisabled =
                  isActing || isBlocked || (isRestricted && !isFollowing);

                return (
                  <Paper
                    key={candidateId}
                    withBorder
                    radius="lg"
                    p="md"
                    shadow="xs"
                  >
                    <Group
                      justify="space-between"
                      align="flex-start"
                      gap="md"
                      wrap="nowrap"
                    >
                      <Group
                        gap="sm"
                        align="flex-start"
                        wrap="nowrap"
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <Avatar
                          src={getUserAvatarUrl(candidate, 48)}
                          alt={candidateDisplayName}
                          size={48}
                          radius="xl"
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={600} truncate>
                            {candidateDisplayName}
                          </Text>
                          {candidateHandle && (
                            <Text size="sm" c="dimmed">
                              {candidateHandle}
                            </Text>
                          )}
                          {isRestricted && (
                            <Text size="xs" c="dimmed">
                              Social actions are unavailable for this account.
                            </Text>
                          )}
                        </div>
                      </Group>
                      <div className="flex flex-wrap justify-end gap-2">
                        {isBlocked ? (
                          <Button
                            size="xs"
                            variant="light"
                            color="gray"
                            loading={isActing}
                            onClick={() => {
                              void runBlockAction(candidate, true);
                            }}
                          >
                            Unblock
                          </Button>
                        ) : isFriend ? (
                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            loading={isActing}
                            onClick={() => {
                              void runSocialAction(
                                candidateId,
                                (id) => userService.removeFriend(id),
                                "Friend removed.",
                              );
                            }}
                          >
                            Remove friend
                          </Button>
                        ) : hasIncomingRequest ? (
                          <>
                            <Button
                              size="xs"
                              variant="light"
                              color="green"
                              loading={isActing}
                              disabled={isRestricted}
                              onClick={() => {
                                void runSocialAction(
                                  candidateId,
                                  (id) => userService.acceptFriendRequest(id),
                                  "Friend request accepted.",
                                );
                              }}
                            >
                              Accept
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              loading={isActing}
                              onClick={() => {
                                void runSocialAction(
                                  candidateId,
                                  (id) => userService.declineFriendRequest(id),
                                  "Friend request declined.",
                                );
                              }}
                            >
                              Decline
                            </Button>
                          </>
                        ) : hasOutgoingRequest ? (
                          <Button size="xs" variant="default" disabled>
                            Request sent
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="light"
                            loading={isActing}
                            disabled={isRestricted}
                            onClick={() => {
                              void runSocialAction(
                                candidateId,
                                (id) => userService.sendFriendRequest(id),
                                "Friend request sent.",
                              );
                            }}
                          >
                            Add friend
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="light"
                          color={isFollowing ? "red" : "blue"}
                          loading={isActing}
                          disabled={followDisabled}
                          onClick={() => {
                            void runSocialAction(
                              candidateId,
                              (id) =>
                                isFollowing
                                  ? userService.unfollowUser(id)
                                  : userService.followUser(id),
                              isFollowing
                                ? "Unfollowed user."
                                : "Following user.",
                            );
                          }}
                        >
                          {isFollowing ? "Unfollow" : "Follow"}
                        </Button>
                        {!isBlocked && (
                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            loading={isActing}
                            onClick={() => {
                              void runBlockAction(candidate, false);
                            }}
                          >
                            Block
                          </Button>
                        )}
                      </div>
                    </Group>
                  </Paper>
                );
              })
            )}
          </div>
        </Paper>

        <div className="space-y-4">
          {renderSocialPeopleList(
            "Incoming friend requests",
            "Loading requests...",
            "No pending friend requests.",
            (socialGraph?.incomingFriendRequests.length ?? 0) > 0 && (
              <div className="space-y-2">
                {socialGraph?.incomingFriendRequests.map((requester) => (
                  <Paper key={requester.$id} withBorder radius="lg" p="sm">
                    <Group justify="space-between" gap="sm" wrap="nowrap">
                      <Group gap="sm" align="center" wrap="nowrap">
                        <Avatar
                          src={getUserAvatarUrl(requester, 40)}
                          alt={getUserFullName(requester)}
                          size={40}
                          radius="xl"
                        />
                        <div>
                          <Text fw={600}>{getUserFullName(requester)}</Text>
                          {getUserHandle(requester) && (
                            <Text size="sm" c="dimmed">
                              {getUserHandle(requester)}
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          loading={socialActionUserId === requester.$id}
                          disabled={isUserSocialInteractionRestricted(
                            requester,
                          )}
                          onClick={() => {
                            void runSocialAction(
                              requester.$id,
                              (id) => userService.acceptFriendRequest(id),
                              "Friend request accepted.",
                            );
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          loading={socialActionUserId === requester.$id}
                          onClick={() => {
                            void runSocialAction(
                              requester.$id,
                              (id) => userService.declineFriendRequest(id),
                              "Friend request declined.",
                            );
                          }}
                        >
                          Decline
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </div>
            ),
          )}

          {renderSocialPeopleList(
            "Friends",
            "Loading friends...",
            "No friends yet.",
            (socialGraph?.friends.length ?? 0) > 0 && (
              <div className="space-y-2">
                {socialGraph?.friends.map((friend) => (
                  <Paper key={friend.$id} withBorder radius="lg" p="sm">
                    <Group justify="space-between" gap="sm" wrap="nowrap">
                      <Group gap="sm" align="center" wrap="nowrap">
                        <Avatar
                          src={getUserAvatarUrl(friend, 40)}
                          alt={getUserFullName(friend)}
                          size={40}
                          radius="xl"
                        />
                        <div>
                          <Text fw={600}>{getUserFullName(friend)}</Text>
                          {getUserHandle(friend) && (
                            <Text size="sm" c="dimmed">
                              {getUserHandle(friend)}
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        loading={socialActionUserId === friend.$id}
                        onClick={() => {
                          void runSocialAction(
                            friend.$id,
                            (id) => userService.removeFriend(id),
                            "Friend removed.",
                          );
                        }}
                      >
                        Remove
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </div>
            ),
          )}

          {renderSocialPeopleList(
            "Following",
            "Loading following...",
            "Not following anyone yet.",
            (socialGraph?.following.length ?? 0) > 0 && (
              <div className="space-y-2">
                {socialGraph?.following.map((entry) => (
                  <Paper key={entry.$id} withBorder radius="lg" p="sm">
                    <Group justify="space-between" gap="sm" wrap="nowrap">
                      <Group gap="sm" align="center" wrap="nowrap">
                        <Avatar
                          src={getUserAvatarUrl(entry, 40)}
                          alt={getUserFullName(entry)}
                          size={40}
                          radius="xl"
                        />
                        <div>
                          <Text fw={600}>{getUserFullName(entry)}</Text>
                          {getUserHandle(entry) && (
                            <Text size="sm" c="dimmed">
                              {getUserHandle(entry)}
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        loading={socialActionUserId === entry.$id}
                        onClick={() => {
                          void runSocialAction(
                            entry.$id,
                            (id) => userService.unfollowUser(id),
                            "Unfollowed user.",
                          );
                        }}
                      >
                        Unfollow
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </div>
            ),
          )}

          {renderSocialPeopleList(
            "Followers",
            "Loading followers...",
            "No followers yet.",
            (socialGraph?.followers.length ?? 0) > 0 && (
              <div className="space-y-2">
                {socialGraph?.followers.map((entry) => (
                  <Paper key={entry.$id} withBorder radius="lg" p="sm">
                    <Group gap="sm" align="center" wrap="nowrap">
                      <Avatar
                        src={getUserAvatarUrl(entry, 40)}
                        alt={getUserFullName(entry)}
                        size={40}
                        radius="xl"
                      />
                      <div>
                        <Text fw={600}>{getUserFullName(entry)}</Text>
                        {getUserHandle(entry) && (
                          <Text size="sm" c="dimmed">
                            {getUserHandle(entry)}
                          </Text>
                        )}
                      </div>
                    </Group>
                  </Paper>
                ))}
              </div>
            ),
          )}

          {renderSocialPeopleList(
            "Blocked users",
            "Loading blocked users...",
            "No blocked users.",
            (socialGraph?.blocked.length ?? 0) > 0 && (
              <div className="space-y-2">
                {socialGraph?.blocked.map((entry) => (
                  <Paper key={entry.$id} withBorder radius="lg" p="sm">
                    <Group justify="space-between" gap="sm" wrap="nowrap">
                      <Group gap="sm" align="center" wrap="nowrap">
                        <Avatar
                          src={getUserAvatarUrl(entry, 40)}
                          alt={getUserFullName(entry)}
                          size={40}
                          radius="xl"
                        />
                        <div>
                          <Text fw={600}>{getUserFullName(entry)}</Text>
                          {getUserHandle(entry) && (
                            <Text size="sm" c="dimmed">
                              {getUserHandle(entry)}
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Button
                        size="xs"
                        variant="light"
                        color="gray"
                        loading={socialActionUserId === entry.$id}
                        onClick={() => {
                          void runBlockAction(entry, true);
                        }}
                      >
                        Unblock
                      </Button>
                    </Group>
                  </Paper>
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );

  const renderFamilyTab = () => (
    <div className="space-y-6">
      <Paper
        withBorder
        radius="xl"
        p="xl"
        shadow="sm"
        style={{
          background:
            "linear-gradient(135deg, rgba(220, 234, 247, 0.9), rgba(248, 250, 252, 0.95))",
        }}
      >
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Badge variant="light" color="blue" radius="xl">
              Family
            </Badge>
            <Title order={3} mt="md">
              Family management
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              Add or link child accounts, review guardian approvals, and keep
              consent paperwork current.
            </Text>
          </div>
          <Group gap="sm">
            <Button
              variant="light"
              size="xs"
              onClick={() => {
                void Promise.all([loadChildren(), loadJoinRequests()]);
              }}
              loading={childrenLoading || joinRequestsLoading}
            >
              Refresh
            </Button>
            <Button
              variant={showAddChildForm ? "default" : "light"}
              size="xs"
              onClick={handleToggleChildForms}
            >
              {showAddChildForm ? "Hide child forms" : "Add or link child"}
            </Button>
          </Group>
        </Group>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Linked children
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {children.length}
            </Text>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Guardian actions
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {joinRequests.length}
            </Text>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Pending child docs
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {totalChildUnsignedCount}
            </Text>
          </div>
        </div>
      </Paper>

      {childrenError && <Alert color="red">{childrenError}</Alert>}

      {showAddChildForm && (
        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <Paper withBorder radius="xl" p="lg" shadow="sm">
            <div className="space-y-3">
              <Title order={5}>
                {isEditingChild ? "Edit child details" : "Add a child"}
              </Title>
              <Text size="sm" c="dimmed">
                Create a managed child account with date-only birth information.
              </Text>
              {childFormError && (
                <Alert color="red" variant="light">
                  {childFormError}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="First name"
                  value={childForm.firstName}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setChildForm((prev) => ({ ...prev, firstName: value }));
                  }}
                />
                <TextInput
                  label="Last name"
                  value={childForm.lastName}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setChildForm((prev) => ({ ...prev, lastName: value }));
                  }}
                />
              </SimpleGrid>
              <TextInput
                label="Email (optional)"
                value={childForm.email}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setChildForm((prev) => ({ ...prev, email: value }));
                }}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Date of birth"
                  type="date"
                  value={childForm.dateOfBirth}
                  max={maxDob}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setChildForm((prev) => ({ ...prev, dateOfBirth: value }));
                  }}
                />
                <Select
                  label="Relationship"
                  data={[
                    { value: "parent", label: "Parent" },
                    { value: "guardian", label: "Guardian" },
                  ]}
                  value={childForm.relationship}
                  onChange={(value) =>
                    setChildForm((prev) => ({
                      ...prev,
                      relationship: value || "parent",
                    }))
                  }
                />
              </SimpleGrid>
              <Group>
                <Button onClick={handleSaveChild} loading={childFormSubmitting}>
                  {isEditingChild ? "Save child" : "Add child"}
                </Button>
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={handleCancelChildForm}
                >
                  Clear
                </Button>
              </Group>
            </div>
          </Paper>

          <Paper withBorder radius="xl" p="lg" shadow="sm">
            <div className="space-y-3">
              <Title order={5}>Link an existing child</Title>
              <Text size="sm" c="dimmed">
                Search for an existing account and attach your guardian
                relationship.
              </Text>
              {linkFormError && (
                <Alert color="red" variant="light">
                  {linkFormError}
                </Alert>
              )}
              <TextInput
                label="Search child account"
                placeholder="Search by name or username"
                value={linkChildSearchQuery}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  if (selectedLinkChild) {
                    setSelectedLinkChild(null);
                  }
                  void searchChildCandidates(value);
                }}
              />

              {linkChildSearchLoading ? (
                <Text size="sm" c="dimmed">
                  Searching...
                </Text>
              ) : linkChildSearchQuery.trim().length < 2 ? (
                <Text size="sm" c="dimmed">
                  Enter at least 2 characters to search.
                </Text>
              ) : linkChildSearchResults.length === 0 && !selectedLinkChild ? (
                <Text size="sm" c="dimmed">
                  No matching users found.
                </Text>
              ) : null}

              {!selectedLinkChild && linkChildSearchResults.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-auto">
                  {linkChildSearchResults.map((candidate) => (
                    <Paper key={candidate.$id} withBorder radius="lg" p="sm">
                      <Group justify="space-between" align="center">
                        <Group gap="sm" align="center" wrap="nowrap">
                          <Avatar
                            src={getUserAvatarUrl(candidate, 40)}
                            alt={getUserFullName(candidate)}
                            size={40}
                            radius="xl"
                          />
                          <div>
                            <Text fw={600}>{getUserFullName(candidate)}</Text>
                            {getUserHandle(candidate) && (
                              <Text size="sm" c="dimmed">
                                {getUserHandle(candidate)}
                              </Text>
                            )}
                          </div>
                        </Group>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            setSelectedLinkChild(candidate);
                            setLinkChildSearchResults([]);
                            setLinkChildSearchQuery(getUserFullName(candidate));
                          }}
                        >
                          Select
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                </div>
              )}

              {selectedLinkChild && (
                <Paper withBorder radius="lg" p="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="sm" align="center">
                      <Avatar
                        src={getUserAvatarUrl(selectedLinkChild, 40)}
                        alt={getUserFullName(selectedLinkChild)}
                        size={40}
                        radius="xl"
                      />
                      <div>
                        <Text fw={600}>
                          {getUserFullName(selectedLinkChild)}
                        </Text>
                        {getUserHandle(selectedLinkChild) && (
                          <Text size="sm" c="dimmed">
                            {getUserHandle(selectedLinkChild)}
                          </Text>
                        )}
                      </div>
                    </Group>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setSelectedLinkChild(null);
                        setLinkChildSearchQuery("");
                        setLinkChildSearchResults([]);
                      }}
                    >
                      Change
                    </Button>
                  </Group>
                </Paper>
              )}

              <Select
                label="Relationship"
                data={[
                  { value: "parent", label: "Parent" },
                  { value: "guardian", label: "Guardian" },
                ]}
                value={linkForm.relationship}
                onChange={(value) =>
                  setLinkForm((prev) => ({
                    ...prev,
                    relationship: value || "parent",
                  }))
                }
              />
              <Button
                onClick={handleLinkChild}
                loading={linkingChild}
                variant="light"
                disabled={!selectedLinkChild}
              >
                Link child
              </Button>
            </div>
          </Paper>
        </SimpleGrid>
      )}

      <Paper withBorder radius="xl" p="lg" shadow="sm">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={5}>Join requests awaiting guardian approval</Title>
            <Text size="sm" c="dimmed">
              Approve or decline event participation requests that require
              guardian review.
            </Text>
          </div>
          <Button
            variant="light"
            size="xs"
            onClick={loadJoinRequests}
            loading={joinRequestsLoading}
          >
            Refresh
          </Button>
        </Group>
        {joinRequestsError && (
          <Alert color="red" variant="light" mb="md">
            {joinRequestsError}
          </Alert>
        )}
        {joinRequestsLoading ? (
          <Text c="dimmed" size="sm">
            Loading join requests...
          </Text>
        ) : joinRequests.length === 0 ? (
          <Text c="dimmed" size="sm">
            No pending join requests.
          </Text>
        ) : (
          <div className="space-y-3">
            {joinRequests.map((request) => (
              <Paper
                key={request.registrationId}
                withBorder
                radius="lg"
                p="md"
                shadow="xs"
              >
                <div className="space-y-1">
                  <Text fw={600}>
                    {request.childFullName || "Child"} requested to join{" "}
                    {request.eventName || "event"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Requested:{" "}
                    {formatDateTimeLabel(request.requestedAt || undefined)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Consent status:{" "}
                    {request.consentStatus || "guardian_approval_required"}
                  </Text>
                  {!request.childHasEmail && (
                    <Alert color="yellow" variant="light" mt="sm">
                      Child email is missing. Approval can proceed, but
                      child-signature document steps remain pending.
                    </Alert>
                  )}
                </div>
                <Group mt="sm" justify="flex-end">
                  <Button
                    size="xs"
                    variant="light"
                    color="green"
                    loading={resolvingJoinRequestId === request.registrationId}
                    onClick={() =>
                      handleResolveJoinRequest(
                        request.registrationId,
                        "approve",
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    loading={resolvingJoinRequestId === request.registrationId}
                    onClick={() =>
                      handleResolveJoinRequest(
                        request.registrationId,
                        "decline",
                      )
                    }
                  >
                    Decline
                  </Button>
                </Group>
              </Paper>
            ))}
          </div>
        )}
      </Paper>

      <div className="space-y-3">
        <Group justify="space-between">
          <div>
            <Title order={4}>Children</Title>
            <Text size="sm" c="dimmed">
              Each child keeps their own linked account data, documents, and
              guardian status.
            </Text>
          </div>
        </Group>
        {childrenLoading ? (
          <Text c="dimmed">Loading children...</Text>
        ) : children.length === 0 ? (
          <Text c="dimmed">No children linked yet.</Text>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {children.map((child) => {
              const name =
                `${child.firstName || ""} ${child.lastName || ""}`.trim();
              const childHandle = (child.userName || "").trim();
              const childUnsignedCount =
                childUnsignedCountById.get(child.userId) ?? 0;
              const hasEmail =
                typeof child.hasEmail === "boolean"
                  ? child.hasEmail
                  : Boolean(child.email);
              const relationship = child.relationship
                ? child.relationship.charAt(0).toUpperCase() +
                  child.relationship.slice(1)
                : "Unknown";
              const initials =
                name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toUpperCase() || "C";
              const statusLabel = child.linkStatus ?? "Unknown";
              const statusColor =
                statusLabel === "active"
                  ? "green"
                  : statusLabel === "pending"
                    ? "yellow"
                    : "gray";

              return (
                <Paper
                  key={child.userId}
                  withBorder
                  radius="xl"
                  shadow="sm"
                  style={{ overflow: "hidden" }}
                >
                  <div className="h-20 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-slate-50" />
                  <div className="-mt-10 px-5 pb-5">
                    <Avatar size={76} radius="xl" color="blue">
                      {initials}
                    </Avatar>
                    <Group
                      justify="space-between"
                      align="flex-start"
                      mt="md"
                      gap="sm"
                    >
                      <div style={{ minWidth: 0 }}>
                        <Text fw={700} size="lg" truncate>
                          {name || "Child"}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {childHandle ? `@${childHandle}` : "No username yet"}
                        </Text>
                      </div>
                      <Badge color={statusColor} variant="light" radius="xl">
                        {statusLabel}
                      </Badge>
                    </Group>
                    <div className="mt-4 space-y-2">
                      <Text size="sm" c="dimmed">
                        Age:{" "}
                        {typeof child.age === "number" ? child.age : "Unknown"}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Relationship: {relationship}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Email: {hasEmail ? child.email || "On file" : "Missing"}
                      </Text>
                      {childUnsignedCount > 0 && (
                        <Alert color="yellow" variant="light" mt="sm">
                          {childUnsignedCount} unsigned document
                          {childUnsignedCount === 1 ? "" : "s"} pending for
                          child signature.
                        </Alert>
                      )}
                      {!hasEmail && (
                        <Alert color="yellow" variant="light" mt="sm">
                          Missing email. Consent links cannot be sent until an
                          email is added.
                        </Alert>
                      )}
                    </div>
                    <Button
                      size="xs"
                      variant="light"
                      mt="lg"
                      onClick={() => handleEditChild(child)}
                    >
                      Edit child
                    </Button>
                  </div>
                </Paper>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderDocumentsTab = () => (
    <div className="space-y-6">
      <Paper withBorder radius="xl" p="xl" shadow="sm">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Badge variant="light" color="blue" radius="xl">
              Documents
            </Badge>
            <Title order={3} mt="md">
              Waivers and signatures
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              Keep track of signatures required for you and the child accounts
              you manage.
            </Text>
          </div>
          <Button
            variant="light"
            size="xs"
            onClick={loadDocuments}
            loading={loadingDocuments}
          >
            Refresh
          </Button>
        </Group>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Requires signature
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {visibleUnsignedDocuments.length}
            </Text>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="dimmed">
              Signed records
            </Text>
            <Text fw={700} size="xl" mt={2}>
              {signedDocuments.length}
            </Text>
          </div>
        </div>
      </Paper>

      {documentsError && <Alert color="red">{documentsError}</Alert>}

      {loadingDocuments ? (
        <Text c="dimmed">Loading documents...</Text>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <Group justify="space-between" align="flex-end">
              <div>
                <Title order={4}>Requires signature</Title>
                <Text size="sm" c="dimmed">
                  Documents that still need action before participation is
                  complete.
                </Text>
              </div>
            </Group>
            {visibleUnsignedDocuments.length === 0 ? (
              <Text c="dimmed">No unsigned document requests.</Text>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleUnsignedDocuments.map((document) => {
                  const viewerCanProxyChildSignature =
                    canViewerProxyChildSignature({
                      signerContext: document.signerContext,
                      viewerUserId: user.$id,
                      childUserId: document.childUserId,
                      childEmail: document.childEmail,
                    });
                  const childMustSignFromOwnAccount =
                    isChildSignatureRestrictedToChildAccount({
                      signerContext: document.signerContext,
                      viewerUserId: user.$id,
                      childUserId: document.childUserId,
                      childEmail: document.childEmail,
                    });
                  const requiresChildEmail = Boolean(
                    document.requiresChildEmail &&
                      !viewerCanProxyChildSignature,
                  );
                  const childName =
                    document.childName ||
                    (document.childUserId
                      ? childNameById.get(document.childUserId)
                      : undefined) ||
                    "Child";

                  return (
                    <Paper
                      key={document.id}
                      withBorder
                      radius="xl"
                      p="lg"
                      shadow="sm"
                    >
                      <div className="space-y-3">
                        <Badge color="yellow" variant="light" radius="xl">
                          Unsigned
                        </Badge>
                        <div>
                          <Text fw={700}>{document.title}</Text>
                          <Text size="sm" c="dimmed">
                            {document.organizationName}
                          </Text>
                        </div>
                        <div className="space-y-1">
                          <Text size="xs" c="dimmed">
                            {document.eventName
                              ? `Event: ${document.eventName}`
                              : document.teamName
                                ? `Team: ${document.teamName}`
                                : "Source: Document"}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Signer: {document.signerContextLabel}
                          </Text>
                          {document.signerContext === "parent_guardian" &&
                            document.childUserId && (
                              <Text size="xs" c="dimmed">
                                Child: {childName}
                              </Text>
                            )}
                          <Text size="xs" c="dimmed">
                            Required: {document.requiredSignerLabel}
                          </Text>
                          {document.consentStatus && (
                            <Text size="xs" c="dimmed">
                              Consent status: {document.consentStatus}
                            </Text>
                          )}
                        </div>
                        {document.statusNote && (
                          <Alert color="yellow" variant="light">
                            {document.statusNote}
                          </Alert>
                        )}
                        <Button
                          size="xs"
                          variant="light"
                          disabled={
                            requiresChildEmail || childMustSignFromOwnAccount
                          }
                          onClick={() => handleStartSigningDocument(document)}
                        >
                          {requiresChildEmail
                            ? "Add child email first"
                            : childMustSignFromOwnAccount
                              ? "Child must sign"
                              : "Sign document"}
                        </Button>
                      </div>
                    </Paper>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Group justify="space-between" align="flex-end">
              <div>
                <Title order={4}>Signed records</Title>
                <Text size="sm" c="dimmed">
                  Previously completed documents available for review.
                </Text>
              </div>
            </Group>
            {signedDocuments.length === 0 ? (
              <Text c="dimmed">No signed documents yet.</Text>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {signedDocuments.map((document) => {
                  const childName =
                    document.childName ||
                    (document.childUserId
                      ? childNameById.get(document.childUserId)
                      : undefined) ||
                    "Child";

                  return (
                    <Paper
                      key={document.id}
                      withBorder
                      radius="xl"
                      p="lg"
                      shadow="sm"
                    >
                      <div className="space-y-3">
                        <Badge color="green" variant="light" radius="xl">
                          Signed
                        </Badge>
                        <div>
                          <Text fw={700}>{document.title}</Text>
                          <Text size="sm" c="dimmed">
                            {document.organizationName}
                          </Text>
                        </div>
                        <div className="space-y-1">
                          <Text size="xs" c="dimmed">
                            {document.eventName
                              ? `Event: ${document.eventName}`
                              : document.teamName
                                ? `Team: ${document.teamName}`
                                : "Source: Document"}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Signed: {formatDateTimeLabel(document.signedAt)}
                          </Text>
                          {document.signerContext === "parent_guardian" &&
                            document.childUserId && (
                              <Text size="xs" c="dimmed">
                                Child: {childName}
                              </Text>
                            )}
                        </div>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => handleOpenSignedDocument(document)}
                        >
                          {document.type === "PDF"
                            ? "View document"
                            : "Preview text"}
                        </Button>
                      </div>
                    </Paper>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      <Paper withBorder radius="xl" p="xl" shadow="sm">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Badge variant="light" color="blue" radius="xl">
              Templates
            </Badge>
            <Title order={3} mt="md">
              Personal event templates
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              Reusable templates for personal events outside organization-owned
              flows.
            </Text>
          </div>
          <Button
            variant="light"
            size="xs"
            onClick={loadEventTemplates}
            loading={loadingEventTemplates}
          >
            Refresh
          </Button>
        </Group>
      </Paper>

      {eventTemplatesError && <Alert color="red">{eventTemplatesError}</Alert>}

      {loadingEventTemplates ? (
        <Text c="dimmed">Loading event templates...</Text>
      ) : eventTemplates.length === 0 ? (
        <Text c="dimmed">No event templates yet.</Text>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {eventTemplates.map((template) => (
            <Paper
              key={template.id}
              withBorder
              radius="xl"
              p="lg"
              shadow="sm"
              style={{
                minHeight: 220,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div className="space-y-3">
                <Badge color="blue" variant="light" radius="xl">
                  Event template
                </Badge>
                <div>
                  <Text fw={700}>{template.name}</Text>
                  {template.start && (
                    <Text size="xs" c="dimmed" mt={6}>
                      Starts: {formatDateTimeLabel(template.start)}
                    </Text>
                  )}
                  {template.end && (
                    <Text size="xs" c="dimmed">
                      Ends: {formatDateTimeLabel(template.end)}
                    </Text>
                  )}
                </div>
              </div>
              <Button
                size="xs"
                variant="light"
                mt="lg"
                onClick={() => router.push(`/events/${template.id}/schedule`)}
              >
                Open template
              </Button>
            </Paper>
          ))}
        </div>
      )}
    </div>
  );

  const renderBillingTab = () => (
    <div className="space-y-6">
      <Paper
        withBorder
        radius="xl"
        p="xl"
        shadow="sm"
        style={{
          background:
            "linear-gradient(135deg, rgba(25, 73, 122, 0.96), rgba(61, 109, 157, 0.96))",
          borderColor: "rgba(25, 73, 122, 0.2)",
        }}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge radius="xl" color="blue" variant="white">
              Billing
            </Badge>
            <Title order={3} mt="md" c="white">
              Payments and subscriptions
            </Title>
            <Text size="sm" c="rgba(255,255,255,0.82)" mt="xs">
              {userHasStripeAccount
                ? "Manage your Stripe connection, upcoming bills, memberships, and refund activity."
                : "Connect Stripe to accept payments for events and rentals, then monitor bills and memberships here."}
            </Text>
          </div>
          <Button
            variant="white"
            color="dark"
            loading={userHasStripeAccount ? managingStripe : connectingStripe}
            onClick={
              userHasStripeAccount
                ? handleManageStripeAccount
                : handleConnectStripeAccount
            }
          >
            {userHasStripeAccount
              ? "Manage Stripe account"
              : "Connect Stripe account"}
          </Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="rgba(255,255,255,0.72)">
              Bills due
            </Text>
            <Text fw={700} size="xl" mt={2} c="white">
              {pendingBillsCount}
            </Text>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="rgba(255,255,255,0.72)">
              Memberships
            </Text>
            <Text fw={700} size="xl" mt={2} c="white">
              {activeMembershipCount}
            </Text>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <Text size="xs" tt="uppercase" fw={700} c="rgba(255,255,255,0.72)">
              Refund views
            </Text>
            <Text fw={700} size="xl" mt={2} c="white">
              2
            </Text>
          </div>
        </div>
      </Paper>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <Group justify="space-between" mb="sm">
            <div>
              <Title order={4}>Bills</Title>
              <Text size="sm" c="dimmed">
                Upcoming payments for personal and team-owned billing.
              </Text>
            </div>
            <Button
              variant="light"
              size="xs"
              onClick={loadBills}
              loading={loadingBills}
            >
              Refresh
            </Button>
          </Group>
          {billError && (
            <Alert color="red" mb="md">
              {billError}
            </Alert>
          )}
          {loadingBills ? (
            <Text c="dimmed">Loading bills...</Text>
          ) : bills.length === 0 ? (
            <Text c="dimmed">No bills available.</Text>
          ) : (
            <div className="space-y-3">
              {bills.map((bill) => {
                const remaining = Math.max(
                  bill.totalAmountCents - bill.paidAmountCents,
                  0,
                );
                const nextAmount =
                  bill.nextPaymentAmountCents !== null &&
                  bill.nextPaymentAmountCents !== undefined
                    ? bill.nextPaymentAmountCents
                    : remaining;
                const nextDue = bill.nextPaymentDue
                  ? formatDisplayDate(bill.nextPaymentDue)
                  : "TBD";
                const ownerName =
                  bill.ownerLabel ??
                  (bill.ownerType === "TEAM"
                    ? (userTeams[bill.ownerId]?.name ?? "Team")
                    : user.fullName);

                return (
                  <Paper
                    key={bill.$id}
                    withBorder
                    radius="lg"
                    p="md"
                    shadow="xs"
                  >
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={700}>{ownerName}</Text>
                        <Text size="sm" c="dimmed">
                          Bill #{bill.$id.slice(0, 6)} • {bill.status}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Next due: {nextDue}
                        </Text>
                      </div>
                      <Badge
                        color={nextAmount > 0 ? "yellow" : "green"}
                        variant="light"
                        radius="xl"
                      >
                        {nextAmount > 0 ? "Payment due" : "Paid up"}
                      </Badge>
                    </Group>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                          Total
                        </Text>
                        <Text fw={700} mt={2}>
                          {formatBillAmount(bill.totalAmountCents)}
                        </Text>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                          Paid
                        </Text>
                        <Text fw={700} mt={2}>
                          {formatBillAmount(bill.paidAmountCents)}
                        </Text>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                          Next
                        </Text>
                        <Text fw={700} mt={2}>
                          {formatBillAmount(nextAmount)}
                        </Text>
                      </div>
                    </div>
                    <Group gap="xs" justify="flex-end" mt="md">
                      {bill.ownerType === "TEAM" && bill.allowSplit && (
                        <Button
                          size="xs"
                          variant="default"
                          loading={splittingBillId === bill.$id}
                          onClick={() => handleSplitBill(bill)}
                        >
                          Split across team
                        </Button>
                      )}
                      <Button
                        size="xs"
                        onClick={() => handlePayBill(bill)}
                        disabled={nextAmount <= 0}
                      >
                        Pay next installment
                      </Button>
                    </Group>
                  </Paper>
                );
              })}
            </div>
          )}
        </Paper>

        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <Group justify="space-between" mb="sm">
            <div>
              <Title order={4}>Memberships</Title>
              <Text size="sm" c="dimmed">
                Subscription products tied to your account and organizations.
              </Text>
            </div>
            <Button
              variant="light"
              size="xs"
              onClick={loadSubscriptions}
              loading={loadingSubscriptions}
            >
              Refresh
            </Button>
          </Group>
          {subscriptionError && (
            <Alert color="red" mb="md">
              {subscriptionError}
            </Alert>
          )}
          {loadingSubscriptions ? (
            <Loading fullScreen={false} text="Loading memberships..." />
          ) : subscriptions.length === 0 ? (
            <Text c="dimmed">No active memberships.</Text>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => {
                const status = sub.status || "ACTIVE";
                const isCancelled = status === "CANCELLED";
                const product = productsById[sub.productId];
                const organization = sub.organizationId
                  ? organizationsById[sub.organizationId]
                  : undefined;
                const membershipTitle =
                  product?.name ?? sub.productId ?? "Membership";
                const organizationLabel = organization?.name
                  ? organization.name
                  : sub.organizationId
                    ? `Organization ${sub.organizationId}`
                    : "Organization";

                return (
                  <Paper
                    key={sub.$id}
                    withBorder
                    radius="lg"
                    p="md"
                    shadow="xs"
                  >
                    <Group justify="space-between" align="flex-start" gap="sm">
                      <div>
                        <Text fw={700}>{membershipTitle}</Text>
                        <Text size="sm" c="dimmed">
                          {organizationLabel}
                        </Text>
                        <Text size="sm" mt={4}>
                          {formatPrice(sub.priceCents)} / {sub.period}
                        </Text>
                        <Text size="xs" c="dimmed" mt={4}>
                          Started {formatDisplayDate(sub.startDate)}
                        </Text>
                      </div>
                      <Badge
                        color={isCancelled ? "red" : "green"}
                        variant="light"
                        radius="xl"
                      >
                        {status}
                      </Badge>
                    </Group>
                    {isCancelled ? (
                      <Button
                        variant="light"
                        color="green"
                        size="xs"
                        fullWidth
                        mt="md"
                        loading={restartingSubId === sub.$id}
                        onClick={() => handleRestartSubscription(sub.$id)}
                      >
                        Restart membership
                      </Button>
                    ) : (
                      <Button
                        variant="light"
                        color="red"
                        size="xs"
                        fullWidth
                        mt="md"
                        loading={cancellingSubId === sub.$id}
                        onClick={() => handleCancelSubscription(sub.$id)}
                      >
                        Cancel membership
                      </Button>
                    )}
                  </Paper>
                );
              })}
            </div>
          )}
        </Paper>
      </SimpleGrid>

      <div className="grid gap-6 xl:grid-cols-2">
        <RefundRequestsList userId={user.$id} />
        <RefundRequestsList hostId={user.$id} />
      </div>
    </div>
  );

  const renderGeneralEditTab = () => (
    <div className="space-y-6">
      <Paper withBorder radius="xl" p="xl" shadow="sm">
        <Badge variant="light" color="blue" radius="xl">
          General info
        </Badge>
        <Title order={3} mt="md">
          Update your profile basics
        </Title>
        <Text size="sm" c="dimmed" mt="xs">
          Keep your name, handle, date of birth, and profile image current.
        </Text>
      </Paper>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <div className="space-y-4">
            <Title order={4}>Profile details</Title>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="First name"
                value={profileData.firstName}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProfileData((prev) => ({ ...prev, firstName: value }));
                }}
                required
              />
              <TextInput
                label="Last name"
                value={profileData.lastName}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProfileData((prev) => ({ ...prev, lastName: value }));
                }}
                required
              />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Date of birth"
                type="date"
                value={profileData.dateOfBirth}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProfileData((prev) => ({ ...prev, dateOfBirth: value }));
                }}
                required
                max={maxDob}
              />
              <TextInput
                label="Username"
                value={profileData.userName}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setProfileData((prev) => ({ ...prev, userName: value }));
                }}
                required
              />
            </SimpleGrid>
          </div>
        </Paper>

        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <div className="space-y-4">
            <Title order={4}>Profile photo</Title>
            <ImageUploader
              currentImageUrl={
                profileData.profileImageId
                  ? `/api/files/${profileData.profileImageId}/preview?w=320&h=320&fit=cover`
                  : ""
              }
              onChange={handleImageUploaded}
              placeholder="Upload new profile picture"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  Member since
                </Text>
                <Text fw={700} mt={2}>
                  {memberSinceLabel}
                </Text>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                  Current email
                </Text>
                <Text fw={700} mt={2} truncate>
                  {currentEmail}
                </Text>
              </div>
            </div>
          </div>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="lg" shadow="sm">
        <div className="space-y-4">
          <div>
            <Title order={4}>Billing address</Title>
            <Text size="sm" c="dimmed" mt="xs">
              This address is used to calculate tax and prefill checkout.
            </Text>
          </div>
          {billingAddressError ? (
            <Alert color="red">{billingAddressError}</Alert>
          ) : null}
          {loadingBillingAddress ? (
            <Text c="dimmed" size="sm">
              Loading billing address...
            </Text>
          ) : (
            <BillingAddressFields
              value={billingAddressData}
              onChange={setBillingAddressData}
              onValidationMessage={setBillingAddressError}
            />
          )}
        </div>
      </Paper>
    </div>
  );

  const renderSecurityEditTab = () => (
    <div className="space-y-6">
      <Paper withBorder radius="xl" p="xl" shadow="sm">
        <Badge variant="light" color="blue" radius="xl">
          Account security
        </Badge>
        <Title order={3} mt="md">
          Protect your sign-in
        </Title>
        <Text size="sm" c="dimmed" mt="xs">
          Update your verified email and change your password when needed.
        </Text>
      </Paper>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <Group justify="space-between" mb="sm">
            <div>
              <Title order={4}>Email address</Title>
              <Text size="sm" c="dimmed">
                We send a verification link before changing your login email.
              </Text>
            </div>
            <Button
              variant="subtle"
              onClick={() => setShowEmailSection(!showEmailSection)}
            >
              {showEmailSection ? "Cancel" : "Change email"}
            </Button>
          </Group>

          {showEmailSection ? (
            <div className="space-y-4">
              <TextInput
                type="email"
                label="New email address"
                placeholder="name@example.com"
                value={emailData.email}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setEmailData((prev) => ({ ...prev, email: value }));
                }}
              />
              <PasswordInput
                label="Current password"
                placeholder="Current password"
                value={emailData.currentPassword}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setEmailData((prev) => ({ ...prev, currentPassword: value }));
                }}
              />
              <Button
                onClick={handleEmailUpdate}
                disabled={
                  saving || !emailData.email || !emailData.currentPassword
                }
              >
                Send verification email
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Group gap="sm">
                <Mail className="h-4 w-4 text-slate-500" />
                <Text size="sm" c="dimmed">
                  Current email: {currentEmail}
                </Text>
              </Group>
            </div>
          )}
        </Paper>

        <Paper withBorder radius="xl" p="lg" shadow="sm">
          <Group justify="space-between" mb="sm">
            <div>
              <Title order={4}>Password</Title>
              <Text size="sm" c="dimmed">
                Choose a new password after confirming your current one.
              </Text>
            </div>
            <Button
              variant="subtle"
              onClick={() => setShowPasswordSection(!showPasswordSection)}
            >
              {showPasswordSection ? "Cancel" : "Change password"}
            </Button>
          </Group>

          {showPasswordSection ? (
            <div className="space-y-4">
              <PasswordInput
                label="Current password"
                placeholder="Current password"
                value={passwordData.currentPassword}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setPasswordData((prev) => ({
                    ...prev,
                    currentPassword: value,
                  }));
                }}
              />
              <PasswordInput
                label="New password"
                placeholder="New password"
                value={passwordData.newPassword}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setPasswordData((prev) => ({ ...prev, newPassword: value }));
                }}
              />
              <PasswordInput
                label="Confirm new password"
                placeholder="Confirm new password"
                value={passwordData.confirmPassword}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setPasswordData((prev) => ({
                    ...prev,
                    confirmPassword: value,
                  }));
                }}
              />
              <Button
                onClick={handlePasswordUpdate}
                disabled={
                  saving ||
                  !passwordData.currentPassword ||
                  !passwordData.newPassword ||
                  !passwordData.confirmPassword
                }
              >
                Update password
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Group gap="sm">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                <Text size="sm" c="dimmed">
                  Use Change password to rotate your sign-in credentials.
                </Text>
              </Group>
            </div>
          )}
        </Paper>
      </SimpleGrid>
    </div>
  );

  const renderMainPanel = () => {
    if (isEditing) {
      return editTab === "general"
        ? renderGeneralEditTab()
        : renderSecurityEditTab();
    }

    switch (activeTab) {
      case "social":
        return renderSocialTab();
      case "family":
        return renderFamilyTab();
      case "documents":
        return renderDocumentsTab();
      case "templates":
        return renderTemplatesTab();
      case "billing":
        return renderBillingTab();
      case "overview":
      default:
        return renderOverviewTab();
    }
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-[linear-gradient(180deg,_rgba(237,243,250,0.85)_0%,_rgba(248,250,252,0.96)_24%,_rgba(255,255,255,1)_100%)] py-8">
        <Container size="xl">
          <div className="space-y-6">
            <Paper withBorder radius="xl" p="xl" shadow="sm">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                  <Avatar
                    src={profileImagePreviewUrl}
                    alt={displayName}
                    size={128}
                    radius={999}
                    style={{
                      boxShadow: "var(--mantine-shadow-lg)",
                    }}
                  />
                  <div>
                    <Group gap="sm" align="center">
                      <Title order={1}>{displayName}</Title>
                      {isEditing && (
                        <Badge variant="light" color="blue" radius="xl">
                          Editing profile
                        </Badge>
                      )}
                    </Group>
                    <Text size="xl" c="dimmed" mt="xs">
                      @{displayHandle}
                    </Text>
                  </div>
                </div>
                <Group gap="sm" justify="flex-end">
                  {isEditing ? (
                    <>
                      <Button variant="default" onClick={handleEditToggle}>
                        Cancel
                      </Button>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save changes"}
                      </Button>
                    </>
                  ) : (
                    <Button onClick={handleEditToggle}>Edit profile</Button>
                  )}
                </Group>
              </div>
            </Paper>

            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-4">
                <Paper
                  withBorder
                  radius="xl"
                  shadow="sm"
                  style={{ overflow: "hidden" }}
                >
                  <div className="grid grid-cols-2 divide-x divide-y divide-slate-200">
                    {[
                      {
                        label: "Teams",
                        value: user.teamIds.length,
                      },
                      {
                        label: "Friends",
                        value: user.friendIds.length,
                      },
                      {
                        label: "Followers",
                        value: socialGraph?.followers.length ?? 0,
                      },
                      {
                        label: "Following",
                        value: user.followingIds.length,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="bg-white px-4 py-5 text-center"
                      >
                        <Text fw={700} size="2.35rem" lh={1} c="dark">
                          {item.value}
                        </Text>
                        <Text
                          size="xs"
                          fw={700}
                          tt="uppercase"
                          c="dimmed"
                          mt="xs"
                          style={{ letterSpacing: "0.22em" }}
                        >
                          {item.label}
                        </Text>
                      </div>
                    ))}
                  </div>
                </Paper>

                <Paper withBorder radius="xl" p="sm" shadow="sm">
                  <div className="space-y-2">
                    {isEditing
                      ? editNavigationItems.map((item) => (
                          <ProfileSidebarItem
                            key={item.id}
                            active={editTab === item.id}
                            description={item.description}
                            icon={item.icon}
                            label={item.label}
                            onClick={() => setEditTab(item.id)}
                          />
                        ))
                      : viewNavigationItems.map((item) => (
                          <ProfileSidebarItem
                            key={item.id}
                            active={activeTab === item.id}
                            badge={item.badge}
                            description={item.description}
                            icon={item.icon}
                            label={item.label}
                            onClick={() => setActiveTab(item.id)}
                          />
                        ))}
                  </div>
                </Paper>
              </div>

              <div className="min-w-0">{renderMainPanel()}</div>
            </div>
          </div>
        </Container>

        <Modal
          opened={Boolean(selectedSignedTextDocument)}
          onClose={() => setSelectedSignedTextDocument(null)}
          centered
          title={
            selectedSignedTextDocument
              ? `Signed text: ${selectedSignedTextDocument.title}`
              : "Signed text"
          }
        >
          {selectedSignedTextDocument ? (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Signed at{" "}
                {formatDateTimeLabel(selectedSignedTextDocument.signedAt)}
              </Text>
              {(selectedSignedTextDocument.eventName || selectedSignedTextDocument.teamName) && (
                <Text size="sm" c="dimmed">
                  {selectedSignedTextDocument.eventName
                    ? `Event: ${selectedSignedTextDocument.eventName}`
                    : `Team: ${selectedSignedTextDocument.teamName}`}
                </Text>
              )}
              <Paper
                withBorder
                radius="md"
                p="sm"
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedSignedTextDocument.content ||
                  "No text content is available for this document."}
              </Paper>
            </Stack>
          ) : null}
        </Modal>

        <Modal
          opened={showSignPasswordModal}
          onClose={resetSigningState}
          centered
          title="Confirm your password"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void confirmPasswordAndStartSigning();
            }}
          >
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Confirm your password before signing this document.
              </Text>
              <PasswordInput
                label="Password"
                value={signPassword}
                onChange={(event) => setSignPassword(event.currentTarget.value)}
                error={signPasswordError ?? undefined}
                required
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={resetSigningState}>
                  Cancel
                </Button>
                <Button type="submit" loading={confirmingSignPassword}>
                  Continue
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>

        <Modal
          opened={showSignModal}
          onClose={resetSigningState}
          centered
          size="xl"
          title="Sign required document"
        >
          {signLinks.length > 0 && (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Document {currentSignIndex + 1} of {signLinks.length}
                {signLinks[currentSignIndex]?.title
                  ? ` • ${signLinks[currentSignIndex]?.title}`
                  : ""}
              </Text>
              {signLinks[currentSignIndex]?.requiredSignerLabel && (
                <Text size="xs" c="dimmed">
                  Required signer:{" "}
                  {signLinks[currentSignIndex]?.requiredSignerLabel}
                </Text>
              )}
              {signLinks[currentSignIndex]?.type === "TEXT" ? (
                <Stack gap="sm">
                  <Paper
                    withBorder
                    p="sm"
                    radius="md"
                    style={{
                      maxHeight: 320,
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {signLinks[currentSignIndex]?.content ||
                      "No waiver text provided."}
                  </Paper>
                  <Checkbox
                    label="I have read and agree to this document."
                    checked={textAccepted}
                    onChange={(event) =>
                      setTextAccepted(event.currentTarget.checked)
                    }
                  />
                  <Group justify="flex-end">
                    <Button variant="default" onClick={resetSigningState}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        void handleTextAcceptance();
                      }}
                      loading={recordingSignature}
                      disabled={!textAccepted || recordingSignature}
                    >
                      Confirm Signature
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Stack gap="sm">
                  <iframe
                    src={signLinks[currentSignIndex]?.url}
                    title="BoldSign Signing"
                    style={{
                      width: "100%",
                      height: 520,
                      border: "1px solid var(--mvp-border)",
                      borderRadius: 8,
                    }}
                  />
                  <Group justify="flex-end">
                    <Button variant="default" onClick={resetSigningState}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        void handleSignedDocument();
                      }}
                      loading={recordingSignature}
                      disabled={recordingSignature}
                    >
                      I finished signing
                    </Button>
                  </Group>
                </Stack>
              )}
            </Stack>
          )}
        </Modal>

        <PaymentModal
          isOpen={!!billPaymentData && !!payingBill}
          onClose={closeBillPaymentModal}
          event={{
            name: payingBill ? "Bill payment" : "Bill",
            location: "",
            eventType: "EVENT",
            price:
              payingBill?.nextPaymentAmountCents ??
              Math.max(
                (payingBill?.totalAmountCents || 0) -
                  (payingBill?.paidAmountCents || 0),
                0,
              ),
          }}
          paymentData={billPaymentData}
          onPaymentSuccess={async () => {
            await loadBills();
            closeBillPaymentModal();
          }}
        />
      </div>
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading profile..." />}>
      <ProfilePageContent />
    </Suspense>
  );
}
