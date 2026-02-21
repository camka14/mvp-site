'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import { userService, type UserSocialGraph } from '@/lib/userService';
import { familyService, FamilyChild, FamilyJoinRequest } from '@/lib/familyService';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Bill, PaymentIntent, Team, UserData, getUserAvatarUrl, formatPrice, formatBillAmount, Product, Organization } from '@/types';
import type { Subscription } from '@/types';
import Loading from '@/components/ui/Loading';
import Navigation from '@/components/layout/Navigation';
import { Container, Group, Title, Text, Button, Paper, TextInput, Alert, Avatar, SimpleGrid, Select, Modal, Stack, PasswordInput, Checkbox, Badge } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { paymentService } from '@/lib/paymentService';
import { billService } from '@/lib/billService';
import { teamService } from '@/lib/teamService';
import PaymentModal from '@/components/ui/PaymentModal';
import { ManageTeams } from '@/app/teams/page';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import { productService } from '@/lib/productService';
import { organizationService } from '@/lib/organizationService';
import { boldsignService, SignStep } from '@/lib/boldsignService';
import { signedDocumentService } from '@/lib/signedDocumentService';
import { profileDocumentService, type ProfileDocumentCard } from '@/lib/profileDocumentService';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/dateUtils';

const toDateInputValue = (value?: string | null): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().split('T')[0];
};

const toIsoDateValue = (value?: string | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day)).toISOString();
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

const formatDobLabel = (value?: string | null): string => {
    const datePart = toDateInputValue(value);
    if (!datePart) return 'Not provided';
    const date = new Date(`${datePart}T00:00:00Z`);
    return formatDisplayDate(date, { timeZone: 'UTC', year: 'numeric' });
};

const formatDateTimeLabel = (value?: string): string => {
    if (!value) return 'Unknown date';
    const formatted = formatDisplayDateTime(value);
    return formatted || 'Unknown date';
};

export default function ProfilePage() {
    const router = useRouter();
    const { user, authUser, loading, setUser } = useApp();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Profile form data
    const [profileData, setProfileData] = useState({
        firstName: '',
        lastName: '',
        userName: '',
        dateOfBirth: '',
        profileImageId: ''
    });

    const [children, setChildren] = useState<FamilyChild[]>([]);
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [childrenError, setChildrenError] = useState<string | null>(null);
    const [joinRequests, setJoinRequests] = useState<FamilyJoinRequest[]>([]);
    const [joinRequestsLoading, setJoinRequestsLoading] = useState(false);
    const [joinRequestsError, setJoinRequestsError] = useState<string | null>(null);
    const [resolvingJoinRequestId, setResolvingJoinRequestId] = useState<string | null>(null);
    const [socialGraph, setSocialGraph] = useState<UserSocialGraph | null>(null);
    const [socialLoading, setSocialLoading] = useState(false);
    const [socialError, setSocialError] = useState<string | null>(null);
    const [socialActionUserId, setSocialActionUserId] = useState<string | null>(null);
    const [socialSearchQuery, setSocialSearchQuery] = useState('');
    const [socialSearchResults, setSocialSearchResults] = useState<UserData[]>([]);
    const [socialSearchLoading, setSocialSearchLoading] = useState(false);
    const [socialSearchError, setSocialSearchError] = useState<string | null>(null);
    const [creatingChild, setCreatingChild] = useState(false);
    const [updatingChild, setUpdatingChild] = useState(false);
    const [linkingChild, setLinkingChild] = useState(false);
    const [childFormError, setChildFormError] = useState<string | null>(null);
    const [linkFormError, setLinkFormError] = useState<string | null>(null);
    const [showAddChildForm, setShowAddChildForm] = useState(false);
    const [editingChildUserId, setEditingChildUserId] = useState<string | null>(null);
    const [childForm, setChildForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        dateOfBirth: '',
        relationship: 'parent',
    });
    const [linkForm, setLinkForm] = useState({
        childEmail: '',
        childUserId: '',
        relationship: 'parent',
    });

    // Account sections
    const [showEmailSection, setShowEmailSection] = useState(false);
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [emailData, setEmailData] = useState({
        email: '',
        currentPassword: ''
    });
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [connectingStripe, setConnectingStripe] = useState(false);
    const [managingStripe, setManagingStripe] = useState(false);
    type OwnedBill = Bill & { ownerLabel?: string };

    const [bills, setBills] = useState<OwnedBill[]>([]);
    const [userTeams, setUserTeams] = useState<Record<string, Team>>({});
    const [loadingBills, setLoadingBills] = useState(false);
    const [billError, setBillError] = useState<string | null>(null);
    const [billPaymentData, setBillPaymentData] = useState<PaymentIntent | null>(null);
    const [payingBill, setPayingBill] = useState<OwnedBill | null>(null);
    const [splittingBillId, setSplittingBillId] = useState<string | null>(null);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [productsById, setProductsById] = useState<Record<string, Product>>({});
    const [organizationsById, setOrganizationsById] = useState<Record<string, Organization>>({});
    const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
    const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
    const [cancellingSubId, setCancellingSubId] = useState<string | null>(null);
    const [restartingSubId, setRestartingSubId] = useState<string | null>(null);
    const [unsignedDocuments, setUnsignedDocuments] = useState<ProfileDocumentCard[]>([]);
    const [signedDocuments, setSignedDocuments] = useState<ProfileDocumentCard[]>([]);
    const [loadingDocuments, setLoadingDocuments] = useState(false);
    const [documentsError, setDocumentsError] = useState<string | null>(null);
    const [eventTemplates, setEventTemplates] = useState<Array<{ id: string; name: string; start?: string; end?: string }>>([]);
    const [loadingEventTemplates, setLoadingEventTemplates] = useState(false);
    const [eventTemplatesError, setEventTemplatesError] = useState<string | null>(null);
    const [selectedSignedTextDocument, setSelectedSignedTextDocument] = useState<ProfileDocumentCard | null>(null);
    const [activeSigningDocument, setActiveSigningDocument] = useState<ProfileDocumentCard | null>(null);
    const [showSignPasswordModal, setShowSignPasswordModal] = useState(false);
    const [signPassword, setSignPassword] = useState('');
    const [signPasswordError, setSignPasswordError] = useState<string | null>(null);
    const [confirmingSignPassword, setConfirmingSignPassword] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [signLinks, setSignLinks] = useState<SignStep[]>([]);
    const [currentSignIndex, setCurrentSignIndex] = useState(0);
    const [pendingSignedDocumentId, setPendingSignedDocumentId] = useState<string | null>(null);
    const [recordingSignature, setRecordingSignature] = useState(false);
    const [textAccepted, setTextAccepted] = useState(false);

    const userHasStripeAccount = Boolean(user?.hasStripeAccount || user?.stripeAccountId);
    const isEditingChild = Boolean(editingChildUserId);
    const childFormSubmitting = creatingChild || updatingChild;
    const today = new Date();
    const maxDob = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Initialize form data when user changes
    useEffect(() => {
        if (user) {
            setProfileData({
                firstName: user.firstName,
                lastName: user.lastName,
                userName: user.userName,
                dateOfBirth: toDateInputValue(user.dateOfBirth),
                profileImageId: user.profileImageId || ''
            });
        }
    }, [user]);

    const handleEditToggle = () => {
        if (isEditing) {
            // Cancel editing - reset to original values
            if (user) {
                setProfileData({
                    firstName: user.firstName,
                    lastName: user.lastName,
                    userName: user.userName,
                    dateOfBirth: toDateInputValue(user.dateOfBirth),
                    profileImageId: user.profileImageId || ''
                });
            }
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
                setError('Please provide a valid date of birth');
                return;
            }
            const updatedUser = await userService.updateProfile(user.$id, {
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                userName: profileData.userName,
                dateOfBirth: normalizedDob,
                profileImageId: profileData.profileImageId
            });

            setUser(updatedUser);
            setIsEditing(false);
        } catch (error: any) {
            setError(error.message || 'Failed to update profile');
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
            const message = err instanceof Error ? err.message : 'Failed to load children.';
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
            const message = err instanceof Error ? err.message : 'Failed to load child join requests.';
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
            const message = err instanceof Error ? err.message : 'Failed to load social connections.';
            setSocialError(message);
            setSocialGraph(null);
        } finally {
            setSocialLoading(false);
        }
    }, []);

    const searchSocialUsers = useCallback(async (query: string) => {
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
            setSocialSearchResults(results.filter((candidate) => candidate.$id !== user?.$id));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to search users.';
            setSocialSearchError(message);
            setSocialSearchResults([]);
        } finally {
            setSocialSearchLoading(false);
        }
    }, [user?.$id]);

    const runSocialAction = useCallback(async (
        targetUserId: string,
        action: (userId: string) => Promise<UserData>,
        successMessage: string,
    ) => {
        setSocialActionUserId(targetUserId);
        setSocialError(null);
        try {
            const updatedUser = await action(targetUserId);
            setUser(updatedUser);
            notifications.show({ color: 'green', message: successMessage });
            await loadSocialGraph();
            if (socialSearchQuery.trim().length >= 2) {
                await searchSocialUsers(socialSearchQuery);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update connection.';
            setSocialError(message);
            notifications.show({ color: 'red', message });
        } finally {
            setSocialActionUserId(null);
        }
    }, [loadSocialGraph, searchSocialUsers, setUser, socialSearchQuery]);

    useEffect(() => {
        if (user) {
            loadChildren();
            loadJoinRequests();
            loadSocialGraph();
        }
    }, [user, loadChildren, loadJoinRequests, loadSocialGraph]);

    const resetChildForm = () => {
        setChildForm({
            firstName: '',
            lastName: '',
            email: '',
            dateOfBirth: '',
            relationship: 'parent',
        });
        setEditingChildUserId(null);
        setChildFormError(null);
    };

    const handleOpenAddChild = () => {
        resetChildForm();
        setShowAddChildForm(true);
    };

    const handleEditChild = (child: FamilyChild) => {
        setChildForm({
            firstName: child.firstName || '',
            lastName: child.lastName || '',
            email: child.email || '',
            dateOfBirth: toDateInputValue(child.dateOfBirth),
            relationship: child.relationship || 'parent',
        });
        setEditingChildUserId(child.userId);
        setChildFormError(null);
        setShowAddChildForm(true);
    };

    const handleCancelChildForm = () => {
        resetChildForm();
        setShowAddChildForm(false);
    };

    const handleSaveChild = async () => {
        if (!childForm.firstName.trim() || !childForm.lastName.trim() || !childForm.dateOfBirth.trim()) {
            setChildFormError('First name, last name, and date of birth are required.');
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
                setShowAddChildForm(false);
                await Promise.all([loadChildren(), loadJoinRequests(), loadDocuments()]);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update child.';
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
            setShowAddChildForm(false);
            await Promise.all([loadChildren(), loadJoinRequests()]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create child.';
            setChildFormError(message);
        } finally {
            setCreatingChild(false);
        }
    };

    const handleLinkChild = async () => {
        if (!linkForm.childEmail.trim() && !linkForm.childUserId.trim()) {
            setLinkFormError('Provide a child email or user ID.');
            return;
        }
        setLinkingChild(true);
        setLinkFormError(null);
        try {
            await familyService.linkChildToParent({
                childEmail: linkForm.childEmail.trim() || undefined,
                childUserId: linkForm.childUserId.trim() || undefined,
                relationship: linkForm.relationship,
            });
            setLinkForm({
                childEmail: '',
                childUserId: '',
                relationship: 'parent',
            });
            await Promise.all([loadChildren(), loadJoinRequests()]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to link child.';
            setLinkFormError(message);
        } finally {
            setLinkingChild(false);
        }
    };

    const handleImageUploaded = (fileId: string, imageUrl: string) => {
        setProfileData(prev => ({ ...prev, profileImageId: imageUrl }));
    };

    const handleEmailUpdate = async () => {
        if (!emailData.email || !emailData.currentPassword) return;

        setSaving(true);
        try {
            await userService.updateEmail(emailData.email, emailData.currentPassword);
            setEmailData({ email: '', currentPassword: '' });
            setShowEmailSection(false);
            alert('Email update initiated. Please check your email for verification.');
        } catch (error: any) {
            setError(error.message || 'Failed to update email');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordUpdate = async () => {
        if (!passwordData.currentPassword || !passwordData.newPassword) return;

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        if (passwordData.newPassword.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }

        setSaving(true);
        try {
            await userService.updatePassword(passwordData.currentPassword, passwordData.newPassword);
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowPasswordSection(false);
            alert('Password updated successfully');
        } catch (error: any) {
            setError(error.message || 'Failed to update password');
        } finally {
            setSaving(false);
        }
    };

    const handleConnectStripeAccount = useCallback(async () => {
        if (!user) return;
        if (typeof window === 'undefined') {
            notifications.show({ color: 'red', message: 'Stripe onboarding is only available in the browser.' });
            return;
        }
        try {
            setConnectingStripe(true);
            const origin = window.location.origin;
            const refreshUrl = `${origin}/profile?stripe=refresh`;
            const returnUrl = `${origin}/profile?stripe=return`;
            const result = await paymentService.connectStripeAccount({
                user,
                refreshUrl,
                returnUrl,
            });
            if (result?.onboardingUrl) {
                window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
            } else {
                notifications.show({ color: 'red', message: 'Stripe onboarding did not return a link. Try again later.' });
            }
        } catch (err) {
            console.error('Failed to connect Stripe account:', err);
            const message = err instanceof Error && err.message ? err.message : 'Unable to start Stripe onboarding right now.';
            notifications.show({ color: 'red', message });
        } finally {
            setConnectingStripe(false);
        }
    }, [user]);

    const handleManageStripeAccount = useCallback(async () => {
        if (!user) return;
        if (typeof window === 'undefined') {
            notifications.show({ color: 'red', message: 'Stripe account management is only available in the browser.' });
            return;
        }
        try {
            setManagingStripe(true);
            const origin = window.location.origin;
            const refreshUrl = `${origin}/profile?stripe=refresh`;
            const returnUrl = `${origin}/profile?stripe=return`;
            const result = await paymentService.manageStripeAccount({
                user,
                refreshUrl,
                returnUrl,
            });
            if (result?.onboardingUrl) {
                window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
            } else {
                notifications.show({ color: 'red', message: 'Stripe did not return a management link. Try again later.' });
            }
        } catch (err) {
            console.error('Failed to manage Stripe account:', err);
            const message = err instanceof Error && err.message ? err.message : 'Unable to open Stripe management right now.';
            notifications.show({ color: 'red', message });
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
                billService.listBills('USER', user.$id),
                teamService.getTeamsByUserId(user.$id),
            ]);

            const captainTeams = fetchedTeams.filter((team) => team.captainId === user.$id);
            const teamsMap = Object.fromEntries(fetchedTeams.map((team) => [team.$id, team]));
            const teamBillsNested = await Promise.all(
                captainTeams.map(async (team) => {
                    try {
                        const billsForTeam = await billService.listBills('TEAM', team.$id);
                        return billsForTeam.map((bill) => ({
                            ...bill,
                            ownerLabel: team.name,
                        }));
                    } catch (err) {
                        console.error(`Failed to load bills for team ${team.$id}`, err);
                        return [];
                    }
                })
            );

            const ownedBills: OwnedBill[] = [
                ...userBills.map((bill) => ({ ...bill, ownerLabel: user.fullName })),
                ...teamBillsNested.flat(),
            ];

            setBills(ownedBills);
            setUserTeams(teamsMap);
        } catch (err) {
            setBillError(err instanceof Error ? err.message : 'Failed to load bills');
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
                setBillError(err instanceof Error ? err.message : 'Failed to start payment');
            }
        },
        [user],
    );

    const handleSplitBill = useCallback(
        async (bill: OwnedBill) => {
            if (bill.ownerType !== 'TEAM' || !bill.allowSplit) return;
            const team = userTeams[bill.ownerId];
            if (!team) {
                notifications.show({ color: 'red', message: 'Unable to load team details for this bill.' });
                return;
            }
            if (!team.playerIds || team.playerIds.length === 0) {
                notifications.show({ color: 'red', message: 'Team has no players to split this bill.' });
                return;
            }
            try {
                setSplittingBillId(bill.$id);
                await billService.splitBill(bill.$id, team.playerIds);
                notifications.show({ color: 'green', message: 'Bill split across the team.' });
                await loadBills();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to split bill';
                notifications.show({ color: 'red', message });
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

            const productIds = Array.from(new Set(subs.map((sub) => sub.productId).filter(Boolean)));
            const organizationIds = Array.from(
                new Set(
                    subs
                        .map((sub) => sub.organizationId)
                        .filter((orgId): orgId is string => typeof orgId === 'string' && Boolean(orgId)),
                ),
            );

            const [products, organizations] = await Promise.all([
                productIds.length ? productService.getProductsByIds(productIds) : Promise.resolve([]),
                organizationIds.length ? organizationService.getOrganizationsByIds(organizationIds) : Promise.resolve([]),
            ]);

            if (products.length) {
                setProductsById((prev) => ({
                    ...prev,
                    ...Object.fromEntries(products.map((product) => [product.$id, product])),
                }));
            }

            if (organizations.length) {
                setOrganizationsById((prev) => ({
                    ...prev,
                    ...Object.fromEntries(organizations.map((organization) => [organization.$id, organization])),
                }));
            }
        } catch (err) {
            setSubscriptionError(err instanceof Error ? err.message : 'Failed to load memberships');
        } finally {
            setLoadingSubscriptions(false);
        }
    }, [user]);

    const handleCancelSubscription = useCallback(
        async (subscriptionId: string) => {
            if (!subscriptionId) return;
            try {
                setCancellingSubId(subscriptionId);
                const cancelled = await productService.cancelSubscription(subscriptionId);
                if (cancelled) {
                    notifications.show({ color: 'green', message: 'Membership cancelled.' });
                    await loadSubscriptions();
                } else {
                    notifications.show({ color: 'red', message: 'Unable to cancel membership. Try again.' });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to cancel membership';
                notifications.show({ color: 'red', message });
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
                const restarted = await productService.restartSubscription(subscriptionId);
                if (restarted) {
                    notifications.show({ color: 'green', message: 'Membership restarted.' });
                    await loadSubscriptions();
                } else {
                    notifications.show({ color: 'red', message: 'Unable to restart membership. Try again.' });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to restart membership';
                notifications.show({ color: 'red', message });
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
        } catch (err) {
            setDocumentsError(err instanceof Error ? err.message : 'Failed to load documents.');
            setUnsignedDocuments([]);
            setSignedDocuments([]);
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
            params.set('state', 'TEMPLATE');
            params.set('limit', '100');
            const response = await fetch(`/api/events?${params.toString()}`, {
                credentials: 'include',
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to load event templates.');
            }
            const rows = Array.isArray(payload?.events) ? payload.events : [];
            setEventTemplates(
                rows
                    .map((row: Record<string, any>) => ({
                        id: String(row?.$id ?? row?.id ?? ''),
                        name: String(row?.name ?? 'Untitled Template'),
                        start: typeof row?.start === 'string' ? row.start : undefined,
                        end: typeof row?.end === 'string' ? row.end : undefined,
                    }))
                    .filter((row: { id: string }) => row.id.length > 0),
            );
        } catch (err) {
            setEventTemplatesError(err instanceof Error ? err.message : 'Failed to load event templates.');
            setEventTemplates([]);
        } finally {
            setLoadingEventTemplates(false);
        }
    }, [user]);

    const handleResolveJoinRequest = useCallback(async (registrationId: string, action: 'approve' | 'decline') => {
        if (!registrationId) return;
        setResolvingJoinRequestId(registrationId);
        setJoinRequestsError(null);
        try {
            const result = await familyService.resolveJoinRequest(registrationId, action);
            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                notifications.show({ color: 'yellow', message: result.warnings[0] });
            } else {
                notifications.show({
                    color: 'green',
                    message: action === 'approve' ? 'Join request approved.' : 'Join request declined.',
                });
            }
            await Promise.all([loadJoinRequests(), loadChildren(), loadDocuments()]);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update join request.';
            setJoinRequestsError(message);
            notifications.show({ color: 'red', message });
        } finally {
            setResolvingJoinRequestId(null);
        }
    }, [loadChildren, loadDocuments, loadJoinRequests]);

    const resetSigningState = useCallback(() => {
        setShowSignPasswordModal(false);
        setSignPassword('');
        setSignPasswordError(null);
        setShowSignModal(false);
        setSignLinks([]);
        setCurrentSignIndex(0);
        setPendingSignedDocumentId(null);
        setRecordingSignature(false);
        setTextAccepted(false);
        setActiveSigningDocument(null);
    }, []);

    const handleOpenSignedDocument = useCallback((document: ProfileDocumentCard) => {
        if (document.type === 'PDF' && document.viewUrl) {
            if (typeof window !== 'undefined') {
                window.open(document.viewUrl, '_blank', 'noopener,noreferrer');
            }
            return;
        }
        setSelectedSignedTextDocument(document);
    }, []);

    const handleStartSigningDocument = useCallback((document: ProfileDocumentCard) => {
        if (!user) return;
        if (!document.eventId) {
            setDocumentsError('Cannot sign this document because the event is missing.');
            return;
        }
        if (document.signerContext === 'child' && document.childUserId && document.childUserId !== user.$id) {
            setDocumentsError('This signature must be completed from the child account.');
            return;
        }
        if (document.requiresChildEmail) {
            setDocumentsError(document.statusNote || 'Add child email before starting this child-signature document.');
            return;
        }
        if (!authUser?.email) {
            setDocumentsError('Sign-in email is required to sign documents.');
            return;
        }
        setDocumentsError(null);
        setActiveSigningDocument(document);
        setSignPassword('');
        setSignPasswordError(null);
        setShowSignPasswordModal(true);
    }, [authUser?.email, user]);

    const confirmPasswordAndStartSigning = useCallback(async () => {
        if (!activeSigningDocument || !user || !authUser?.email || !activeSigningDocument.eventId) {
            return;
        }
        if (!signPassword.trim()) {
            setSignPasswordError('Password is required.');
            return;
        }
        setConfirmingSignPassword(true);
        setSignPasswordError(null);
        try {
            const response = await fetch('/api/documents/confirm-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: authUser.email,
                    password: signPassword,
                    eventId: activeSigningDocument.eventId,
                }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result?.error) {
                throw new Error(result?.error || 'Password confirmation failed.');
            }

            const links = await boldsignService.createSignLinks({
                eventId: activeSigningDocument.eventId,
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
                notifications.show({ color: 'yellow', message: 'No unsigned signature step was returned for this document.' });
                return;
            }

            setSignLinks(links);
            setCurrentSignIndex(0);
            setPendingSignedDocumentId(null);
            setSignPassword('');
            setShowSignPasswordModal(false);
            setShowSignModal(true);
        } catch (error) {
            setSignPasswordError(error instanceof Error ? error.message : 'Failed to confirm password.');
        } finally {
            setConfirmingSignPassword(false);
        }
    }, [activeSigningDocument, authUser?.email, loadDocuments, resetSigningState, signPassword, user]);

    const recordSignature = useCallback(async (payload: {
        templateId: string;
        documentId: string;
        type: SignStep['type'];
    }) => {
        if (!activeSigningDocument?.eventId || !user) {
            throw new Error('Event and user are required to record signatures.');
        }
        const signingUserId = activeSigningDocument.signerContext === 'child' && activeSigningDocument.childUserId
            ? activeSigningDocument.childUserId
            : user.$id;
        const response = await fetch('/api/documents/record-signature', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                templateId: payload.templateId,
                documentId: payload.documentId,
                eventId: activeSigningDocument.eventId,
                type: payload.type,
                userId: signingUserId,
                childUserId: activeSigningDocument.childUserId,
                signerContext: activeSigningDocument.signerContext,
                user,
            }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.error) {
            throw new Error(result?.error || 'Failed to record signature.');
        }
    }, [activeSigningDocument, user]);

    const handleSignedDocument = useCallback(async (messageDocumentId?: string) => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type === 'TEXT') {
            return;
        }
        if (messageDocumentId && messageDocumentId !== currentLink.documentId) {
            return;
        }
        if (pendingSignedDocumentId || recordingSignature) {
            return;
        }
        if (!currentLink.documentId) {
            setDocumentsError('Missing document identifier for signature.');
            return;
        }

        setRecordingSignature(true);
        try {
            await recordSignature({
                templateId: currentLink.templateId,
                documentId: currentLink.documentId,
                type: currentLink.type,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(currentLink.documentId);
        } catch (error) {
            setDocumentsError(error instanceof Error ? error.message : 'Failed to record signature.');
            resetSigningState();
        } finally {
            setRecordingSignature(false);
        }
    }, [currentSignIndex, pendingSignedDocumentId, recordSignature, recordingSignature, resetSigningState, signLinks]);

    const handleTextAcceptance = useCallback(async () => {
        const currentLink = signLinks[currentSignIndex];
        if (!currentLink || currentLink.type !== 'TEXT') {
            return;
        }
        if (!textAccepted || pendingSignedDocumentId || recordingSignature) {
            return;
        }

        const documentId = currentLink.documentId || (
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`
        );
        setRecordingSignature(true);
        try {
            await recordSignature({
                templateId: currentLink.templateId,
                documentId,
                type: currentLink.type,
            });
            setShowSignModal(false);
            setPendingSignedDocumentId(documentId);
        } catch (error) {
            setDocumentsError(error instanceof Error ? error.message : 'Failed to record signature.');
            resetSigningState();
        } finally {
            setRecordingSignature(false);
        }
    }, [currentSignIndex, pendingSignedDocumentId, recordSignature, recordingSignature, resetSigningState, signLinks, textAccepted]);

    useEffect(() => {
        setTextAccepted(false);
    }, [currentSignIndex, signLinks]);

    useEffect(() => {
        if (!showSignModal) {
            return;
        }

        const handleMessage = (event: MessageEvent) => {
            if (typeof event.origin === 'string' && !event.origin.includes('boldsign')) {
                return;
            }
            const payload = event.data;
            let eventName = '';
            if (typeof payload === 'string') {
                eventName = payload;
            } else if (payload && typeof payload === 'object') {
                eventName = payload.event || payload.eventName || payload.type || payload.name || '';
            }
            const eventLabel = eventName.toString();
            if (!eventLabel || (!eventLabel.includes('onDocumentSigned') && !eventLabel.includes('documentSigned'))) {
                return;
            }

            const documentId =
                (payload && typeof payload === 'object' && (payload.documentId || payload.documentID)) || undefined;
            void handleSignedDocument(
                typeof documentId === 'string' ? documentId : undefined,
            );
        };

        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, [handleSignedDocument, showSignModal]);

    useEffect(() => {
        if (!pendingSignedDocumentId) {
            return;
        }

        let cancelled = false;
        const poll = async () => {
            try {
                const signingUserId = activeSigningDocument?.signerContext === 'child' && activeSigningDocument?.childUserId
                    ? activeSigningDocument.childUserId
                    : user?.$id;
                const signed = await signedDocumentService.isDocumentSigned(pendingSignedDocumentId, signingUserId);
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
                notifications.show({ color: 'green', message: 'Document signed.' });
            } catch (error) {
                if (cancelled) {
                    return;
                }
                setDocumentsError(error instanceof Error ? error.message : 'Failed to confirm signature.');
                resetSigningState();
            }
        };

        const interval = window.setInterval(poll, 1000);
        void poll();
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [activeSigningDocument, currentSignIndex, loadDocuments, pendingSignedDocumentId, resetSigningState, signLinks, user?.$id]);

    useEffect(() => {
        if (user) {
            loadBills();
            loadSubscriptions();
            loadDocuments();
            loadEventTemplates();
        }
    }, [user, loadBills, loadSubscriptions, loadDocuments, loadEventTemplates]);

    if (loading) {
        return <Loading />;
    }

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-600">Please log in to view your profile.</p>
            </div>
        );
    }

    const profileImagePreviewUrl = profileData.profileImageId
        ? `/api/files/${profileData.profileImageId}/preview?w=128&h=128&fit=cover`
        : getUserAvatarUrl(user, 128);

    return (
        <>
            <Navigation />
            <div className="min-h-screen bg-gray-50 py-8">
                <Container size="lg">
                    {/* Profile Header */}
                    <Paper radius="lg" shadow="xl" withBorder>
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-32"></div>
                        <div className="relative px-6 pb-6">
                            {/* Profile Picture */}
                            <div className="flex items-end -mt-16 mb-6 bg">
                                <div className="relative">
                                    <Avatar
                                        src={profileImagePreviewUrl}
                                        alt={user.fullName}
                                        size={128}
                                        radius="xl"
                                        bg="white"
                                        style={{ backgroundColor: '#fff', border: '4px solid #fff', boxShadow: 'var(--mantine-shadow-lg)' }}
                                    />
                                </div>
                                <div className="ml-6 flex-1">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Title order={2}>{isEditing ? 'Edit Profile' : user.fullName}</Title>
                                            {!isEditing && (
                                                <Text size="lg" c="dimmed">@{user.userName}</Text>
                                            )}
                                        </div>
                                        <Group gap="sm">
                                            {isEditing ? (
                                                <>
                                                    <Button variant="default" onClick={handleEditToggle}>Cancel</Button>
                                                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
                                                </>
                                            ) : (
                                                <Button onClick={handleEditToggle}>Edit Profile</Button>
                                            )}
                                        </Group>
                                    </div>
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <Alert color="red" variant="light" mb="md">{error}</Alert>
                            )}

                            {/* Profile Image Upload (Edit Mode Only) */}
                            {isEditing && (
                                <div className="mb-6">
                                    <Text size="sm" fw={500} mb={6}>Profile Picture</Text>
                                    <ImageUploader
                                        currentImageUrl={
                                            profileData.profileImageId
                                                ? `/api/files/${profileData.profileImageId}/preview?w=320&h=320&fit=cover`
                                                : ''
                                        }
                                        placeholder="Upload new profile picture"
                                    />
                                </div>
                            )}

                            {/* Profile Information */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Personal Information */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>

                                    {/* First Name */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>First Name</Text>
                                        {isEditing ? (
                                            <TextInput
                                                value={profileData.firstName}
                                                onChange={(event) => {
                                                    const value = event.currentTarget.value;
                                                    setProfileData((prev) => ({ ...prev, firstName: value }));
                                                }}
                                                required
                                            />
                                        ) : (
                                            <p className="text-gray-900 py-2">{user.firstName}</p>
                                        )}
                                    </div>

                                    {/* Last Name */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>Last Name</Text>
                                        {isEditing ? (
                                            <TextInput
                                                value={profileData.lastName}
                                                onChange={(event) => {
                                                    const value = event.currentTarget.value;
                                                    setProfileData((prev) => ({ ...prev, lastName: value }));
                                                }}
                                                required
                                            />
                                        ) : (
                                            <p className="text-gray-900 py-2">{user.lastName}</p>
                                        )}
                                    </div>

                                    {/* Date of Birth */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>Date of Birth</Text>
                                        {isEditing ? (
                                            <TextInput
                                                type="date"
                                                value={profileData.dateOfBirth}
                                                onChange={(event) => {
                                                    const value = event.currentTarget.value;
                                                    setProfileData(prev => ({ ...prev, dateOfBirth: value }));
                                                }}
                                                required
                                                max={maxDob}
                                            />
                                        ) : (
                                            <p className="text-gray-900 py-2">{formatDobLabel(user.dateOfBirth)}</p>
                                        )}
                                    </div>

                                    {/* Username */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>Username</Text>
                                        {isEditing ? (
                                            <TextInput
                                                value={profileData.userName}
                                                onChange={(event) => {
                                                    const value = event.currentTarget.value;
                                                    setProfileData((prev) => ({ ...prev, userName: value }));
                                                }}
                                                required
                                            />
                                        ) : (
                                            <p className="text-gray-900 py-2">@{user.userName}</p>
                                        )}
                                    </div>

                                    {/* Member Since */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>Member Since</Text>
                                        <p className="text-gray-900 py-2">
                                            {user.$createdAt ? formatDisplayDate(user.$createdAt) : 'Unknown'}
                                        </p>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-gray-900">Activity Summary</h3>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold text-blue-600">{user.teamIds.length}</p>
                                            <p className="text-gray-600">Teams</p>
                                        </div>
                                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold text-green-600">{user.friendIds.length}</p>
                                            <p className="text-gray-600">Friends</p>
                                        </div>
                                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold text-indigo-600">{user.followingIds.length}</p>
                                            <p className="text-gray-600">Following</p>
                                        </div>
                                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold text-purple-600">{socialGraph?.followers.length ?? 0}</p>
                                            <p className="text-gray-600">Followers</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Paper>

                    <div className="mt-8">
                        <Paper withBorder radius="lg" p="md" shadow="sm">
                            <Suspense fallback={<Loading text="Loading teams..." />}>
                                <ManageTeams showNavigation={false} withContainer={false} />
                            </Suspense>
                        </Paper>
                    </div>

                    <div className="mt-8">
                        <Paper withBorder radius="lg" p="md" shadow="sm">
                            <Group justify="space-between" mb="sm">
                                <Title order={4}>Connections</Title>
                                <Button
                                    variant="light"
                                    size="xs"
                                    onClick={() => { void loadSocialGraph(); }}
                                    loading={socialLoading}
                                >
                                    Refresh
                                </Button>
                            </Group>
                            <Text size="sm" c="dimmed" mb="sm">
                                Manage friend requests, friends, and following.
                            </Text>
                            {socialError && (
                                <Alert color="red" mb="sm">
                                    {socialError}
                                </Alert>
                            )}
                            <Paper withBorder radius="md" p="md" shadow="xs" className="w-full max-w-3xl" mb="md">
                                <div className="space-y-3">
                                    <Title order={5}>Find people</Title>
                                    <TextInput
                                        placeholder="Search by name or username"
                                        value={socialSearchQuery}
                                        onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            void searchSocialUsers(value);
                                        }}
                                    />
                                    {socialSearchError && (
                                        <Alert color="red" variant="light">
                                            {socialSearchError}
                                        </Alert>
                                    )}
                                    {socialSearchLoading ? (
                                        <Text c="dimmed" size="sm">Searching...</Text>
                                    ) : socialSearchQuery.trim().length < 2 ? (
                                        <Text c="dimmed" size="sm">Enter at least 2 characters to search.</Text>
                                    ) : socialSearchResults.length === 0 ? (
                                        <Text c="dimmed" size="sm">No users found.</Text>
                                    ) : (
                                        <div className="space-y-3">
                                            {socialSearchResults.map((candidate) => {
                                                const candidateId = candidate.$id;
                                                const isFriend = user.friendIds.includes(candidateId);
                                                const isFollowing = user.followingIds.includes(candidateId);
                                                const hasIncomingRequest = user.friendRequestIds.includes(candidateId);
                                                const hasOutgoingRequest = user.friendRequestSentIds.includes(candidateId);
                                                const isActing = socialActionUserId === candidateId;

                                                return (
                                                    <Paper key={candidateId} withBorder radius="md" p="sm">
                                                        <Group justify="space-between" align="flex-start">
                                                            <div>
                                                                <Text fw={600}>{candidate.fullName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'User'}</Text>
                                                                <Text size="sm" c="dimmed">@{candidate.userName || 'user'}</Text>
                                                            </div>
                                                            <Group gap="xs">
                                                                {isFriend ? (
                                                                    <Button
                                                                        size="xs"
                                                                        variant="light"
                                                                        color="red"
                                                                        loading={isActing}
                                                                        onClick={() => { void runSocialAction(candidateId, (id) => userService.removeFriend(id), 'Friend removed.'); }}
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
                                                                            onClick={() => { void runSocialAction(candidateId, (id) => userService.acceptFriendRequest(id), 'Friend request accepted.'); }}
                                                                        >
                                                                            Accept
                                                                        </Button>
                                                                        <Button
                                                                            size="xs"
                                                                            variant="light"
                                                                            color="red"
                                                                            loading={isActing}
                                                                            onClick={() => { void runSocialAction(candidateId, (id) => userService.declineFriendRequest(id), 'Friend request declined.'); }}
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
                                                                        onClick={() => { void runSocialAction(candidateId, (id) => userService.sendFriendRequest(id), 'Friend request sent.'); }}
                                                                    >
                                                                        Add friend
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    size="xs"
                                                                    variant="light"
                                                                    color={isFollowing ? 'red' : 'blue'}
                                                                    loading={isActing}
                                                                    onClick={() => {
                                                                        void runSocialAction(
                                                                            candidateId,
                                                                            (id) => (isFollowing ? userService.unfollowUser(id) : userService.followUser(id)),
                                                                            isFollowing ? 'Unfollowed user.' : 'Following user.',
                                                                        );
                                                                    }}
                                                                >
                                                                    {isFollowing ? 'Unfollow' : 'Follow'}
                                                                </Button>
                                                            </Group>
                                                        </Group>
                                                    </Paper>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </Paper>

                            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                                <Paper withBorder radius="md" p="md" shadow="xs">
                                    <Title order={5} mb="sm">Incoming Friend Requests</Title>
                                    {socialLoading ? (
                                        <Text c="dimmed" size="sm">Loading requests...</Text>
                                    ) : (socialGraph?.incomingFriendRequests.length ?? 0) === 0 ? (
                                        <Text c="dimmed" size="sm">No pending friend requests.</Text>
                                    ) : (
                                        <div className="space-y-2">
                                            {socialGraph?.incomingFriendRequests.map((requester) => (
                                                <Paper key={requester.$id} withBorder radius="md" p="sm">
                                                    <Group justify="space-between">
                                                        <div>
                                                            <Text fw={600}>{requester.fullName || `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || 'User'}</Text>
                                                            <Text size="sm" c="dimmed">@{requester.userName || 'user'}</Text>
                                                        </div>
                                                        <Group gap="xs">
                                                            <Button
                                                                size="xs"
                                                                variant="light"
                                                                color="green"
                                                                loading={socialActionUserId === requester.$id}
                                                                onClick={() => { void runSocialAction(requester.$id, (id) => userService.acceptFriendRequest(id), 'Friend request accepted.'); }}
                                                            >
                                                                Accept
                                                            </Button>
                                                            <Button
                                                                size="xs"
                                                                variant="light"
                                                                color="red"
                                                                loading={socialActionUserId === requester.$id}
                                                                onClick={() => { void runSocialAction(requester.$id, (id) => userService.declineFriendRequest(id), 'Friend request declined.'); }}
                                                            >
                                                                Decline
                                                            </Button>
                                                        </Group>
                                                    </Group>
                                                </Paper>
                                            ))}
                                        </div>
                                    )}
                                </Paper>

                                <Paper withBorder radius="md" p="md" shadow="xs">
                                    <Title order={5} mb="sm">Friends</Title>
                                    {socialLoading ? (
                                        <Text c="dimmed" size="sm">Loading friends...</Text>
                                    ) : (socialGraph?.friends.length ?? 0) === 0 ? (
                                        <Text c="dimmed" size="sm">No friends yet.</Text>
                                    ) : (
                                        <div className="space-y-2">
                                            {socialGraph?.friends.map((friend) => (
                                                <Paper key={friend.$id} withBorder radius="md" p="sm">
                                                    <Group justify="space-between">
                                                        <div>
                                                            <Text fw={600}>{friend.fullName || `${friend.firstName || ''} ${friend.lastName || ''}`.trim() || 'User'}</Text>
                                                            <Text size="sm" c="dimmed">@{friend.userName || 'user'}</Text>
                                                        </div>
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            color="red"
                                                            loading={socialActionUserId === friend.$id}
                                                            onClick={() => { void runSocialAction(friend.$id, (id) => userService.removeFriend(id), 'Friend removed.'); }}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </Group>
                                                </Paper>
                                            ))}
                                        </div>
                                    )}
                                </Paper>

                                <Paper withBorder radius="md" p="md" shadow="xs">
                                    <Title order={5} mb="sm">Following</Title>
                                    {socialLoading ? (
                                        <Text c="dimmed" size="sm">Loading following...</Text>
                                    ) : (socialGraph?.following.length ?? 0) === 0 ? (
                                        <Text c="dimmed" size="sm">Not following anyone yet.</Text>
                                    ) : (
                                        <div className="space-y-2">
                                            {socialGraph?.following.map((entry) => (
                                                <Paper key={entry.$id} withBorder radius="md" p="sm">
                                                    <Group justify="space-between">
                                                        <div>
                                                            <Text fw={600}>{entry.fullName || `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'User'}</Text>
                                                            <Text size="sm" c="dimmed">@{entry.userName || 'user'}</Text>
                                                        </div>
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            color="red"
                                                            loading={socialActionUserId === entry.$id}
                                                            onClick={() => { void runSocialAction(entry.$id, (id) => userService.unfollowUser(id), 'Unfollowed user.'); }}
                                                        >
                                                            Unfollow
                                                        </Button>
                                                    </Group>
                                                </Paper>
                                            ))}
                                        </div>
                                    )}
                                </Paper>

                                <Paper withBorder radius="md" p="md" shadow="xs">
                                    <Title order={5} mb="sm">Following You</Title>
                                    {socialLoading ? (
                                        <Text c="dimmed" size="sm">Loading followers...</Text>
                                    ) : (socialGraph?.followers.length ?? 0) === 0 ? (
                                        <Text c="dimmed" size="sm">No followers yet.</Text>
                                    ) : (
                                        <div className="space-y-2">
                                            {socialGraph?.followers.map((entry) => (
                                                <Paper key={entry.$id} withBorder radius="md" p="sm">
                                                    <Text fw={600}>{entry.fullName || `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'User'}</Text>
                                                    <Text size="sm" c="dimmed">@{entry.userName || 'user'}</Text>
                                                </Paper>
                                            ))}
                                        </div>
                                    )}
                                </Paper>
                            </SimpleGrid>
                        </Paper>
                    </div>

                    <div className="mt-8">
                        <Paper withBorder radius="lg" p="md" shadow="sm">
                            <Group justify="space-between" mb="sm">
                                <Title order={4}>Children</Title>
                                <Button
                                    variant="light"
                                    size="xs"
                                    onClick={() => { void Promise.all([loadChildren(), loadJoinRequests()]); }}
                                    loading={childrenLoading || joinRequestsLoading}
                                >
                                    Refresh
                                </Button>
                            </Group>
                            {childrenError && (
                                <Alert color="red" mb="sm">
                                    {childrenError}
                                </Alert>
                            )}
                            <Button onClick={handleOpenAddChild} mb="md">
                                Add child
                            </Button>

                            {showAddChildForm && (
                                <Paper withBorder radius="md" p="md" shadow="xs" mb="md" className="w-full max-w-3xl">
                                    <div className="space-y-3">
                                        <Title order={5}>{isEditingChild ? 'Edit child details' : 'Add a child'}</Title>
                                        {childFormError && (
                                            <Alert color="red" variant="light">
                                                {childFormError}
                                            </Alert>
                                        )}
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
                                        <TextInput
                                            label="Email (optional)"
                                            value={childForm.email}
                                            onChange={(event) => {
                                                const value = event.currentTarget.value;
                                                setChildForm((prev) => ({ ...prev, email: value }));
                                            }}
                                        />
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
                                                { value: 'parent', label: 'Parent' },
                                                { value: 'guardian', label: 'Guardian' },
                                            ]}
                                            value={childForm.relationship}
                                            onChange={(value) => setChildForm(prev => ({ ...prev, relationship: value || 'parent' }))}
                                        />
                                        <Group>
                                            <Button onClick={handleSaveChild} loading={childFormSubmitting}>
                                                {isEditingChild ? 'Save child' : 'Add child'}
                                            </Button>
                                            <Button variant="subtle" color="gray" onClick={handleCancelChildForm}>
                                                Cancel
                                            </Button>
                                        </Group>
                                    </div>
                                </Paper>
                            )}

                            <Paper withBorder radius="md" p="md" shadow="xs" className="w-full max-w-3xl">
                                <div className="space-y-3">
                                    <Title order={5}>Link an existing child</Title>
                                    {linkFormError && (
                                        <Alert color="red" variant="light">
                                            {linkFormError}
                                        </Alert>
                                    )}
                                    <TextInput
                                        label="Child email"
                                        value={linkForm.childEmail}
                                        onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            setLinkForm((prev) => ({ ...prev, childEmail: value }));
                                        }}
                                    />
                                    <TextInput
                                        label="Child user ID"
                                        value={linkForm.childUserId}
                                        onChange={(event) => {
                                            const value = event.currentTarget.value;
                                            setLinkForm((prev) => ({ ...prev, childUserId: value }));
                                        }}
                                    />
                                    <Select
                                        label="Relationship"
                                        data={[
                                            { value: 'parent', label: 'Parent' },
                                            { value: 'guardian', label: 'Guardian' },
                                        ]}
                                        value={linkForm.relationship}
                                        onChange={(value) => setLinkForm(prev => ({ ...prev, relationship: value || 'parent' }))}
                                    />
                                    <Button onClick={handleLinkChild} loading={linkingChild} variant="light">
                                        Link child
                                    </Button>
                                    <Text size="xs" c="dimmed">
                                        Provide either the child email or user ID to link an existing account.
                                    </Text>
                                </div>
                            </Paper>

                            <Paper withBorder radius="md" p="md" shadow="xs" className="w-full max-w-3xl" mt="md">
                                <Group justify="space-between" mb="xs">
                                    <Title order={5}>Join requests awaiting guardian approval</Title>
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
                                    <Alert color="red" variant="light" mb="sm">
                                        {joinRequestsError}
                                    </Alert>
                                )}
                                {joinRequestsLoading ? (
                                    <Text c="dimmed" size="sm">Loading join requests...</Text>
                                ) : joinRequests.length === 0 ? (
                                    <Text c="dimmed" size="sm">No pending join requests.</Text>
                                ) : (
                                    <div className="space-y-3">
                                        {joinRequests.map((request) => (
                                            <Paper key={request.registrationId} withBorder radius="md" p="sm">
                                                <div className="space-y-1">
                                                    <Text fw={600}>{request.childFullName || 'Child'} requested to join {request.eventName || 'event'}</Text>
                                                    <Text size="xs" c="dimmed">
                                                        Requested: {formatDateTimeLabel(request.requestedAt || undefined)}
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        Consent status: {request.consentStatus || 'guardian_approval_required'}
                                                    </Text>
                                                    {!request.childHasEmail && (
                                                        <Alert color="yellow" variant="light" mt="xs">
                                                            Child email is missing. Approval can proceed, but child-signature document steps remain pending.
                                                        </Alert>
                                                    )}
                                                </div>
                                                <Group mt="sm" justify="flex-end">
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        color="green"
                                                        loading={resolvingJoinRequestId === request.registrationId}
                                                        onClick={() => handleResolveJoinRequest(request.registrationId, 'approve')}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="xs"
                                                        variant="light"
                                                        color="red"
                                                        loading={resolvingJoinRequestId === request.registrationId}
                                                        onClick={() => handleResolveJoinRequest(request.registrationId, 'decline')}
                                                    >
                                                        Decline
                                                    </Button>
                                                </Group>
                                            </Paper>
                                        ))}
                                    </div>
                                )}
                            </Paper>

                            <Title order={5} mt="lg" mb="sm">Children</Title>
                            {childrenLoading ? (
                                <Text c="dimmed">Loading children...</Text>
                            ) : children.length === 0 ? (
                                <Text c="dimmed">No children linked yet.</Text>
                            ) : (
                                <SimpleGrid
                                    cols={{ base: 1, sm: 2, lg: 3 }}
                                    spacing="md"
                                >
                                    {children.map((child) => {
                                        const name = `${child.firstName || ''} ${child.lastName || ''}`.trim();
                                        const childHandle = (child.userName || '').trim();
                                        const hasEmail = typeof child.hasEmail === 'boolean'
                                            ? child.hasEmail
                                            : Boolean(child.email);
                                        const relationship = child.relationship
                                            ? child.relationship.charAt(0).toUpperCase() + child.relationship.slice(1)
                                            : 'Unknown';
                                        return (
                                            <Paper
                                                key={child.userId}
                                                withBorder
                                                radius="md"
                                                p="md"
                                                shadow="xs"
                                                style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                                            >
                                                <div>
                                                    <Text fw={600}>{name || 'Child'}</Text>
                                                    <Text size="sm" c="dimmed">@{childHandle || 'user'}</Text>
                                                    <Text size="sm" c="dimmed">
                                                        Age: {typeof child.age === 'number' ? child.age : 'Unknown'}
                                                    </Text>
                                                    <Text size="sm" c="dimmed">
                                                        Status: {child.linkStatus ?? 'Unknown'}
                                                    </Text>
                                                    <Text size="sm" c="dimmed">
                                                        Relationship: {relationship}
                                                    </Text>
                                                    {!hasEmail && (
                                                        <Alert color="yellow" variant="light" mt="sm">
                                                            Missing email. Consent links cannot be sent until an email is added.
                                                        </Alert>
                                                    )}
                                                </div>
                                                <Button size="xs" variant="light" mt="md" onClick={() => handleEditChild(child)}>
                                                    Edit
                                                </Button>
                                            </Paper>
                                        );
                                    })}
                                </SimpleGrid>
                            )}
                        </Paper>
                    </div>

                    <div className="mt-8">
                        <Paper withBorder radius="lg" p="md" shadow="sm">
                            <Group justify="space-between" mb="sm">
                                <Title order={4}>Documents</Title>
                                <Button variant="light" size="xs" onClick={loadDocuments} loading={loadingDocuments}>
                                    Refresh
                                </Button>
                            </Group>
                            <Text size="sm" c="dimmed" mb="sm">
                                Signature requests and completed signatures across your events.
                            </Text>
                            {documentsError && (
                                <Alert color="red" mb="sm">
                                    {documentsError}
                                </Alert>
                            )}

                            {loadingDocuments ? (
                                <Text c="dimmed">Loading documents...</Text>
                            ) : (
                                <div className="space-y-6">
                                    <div>
                                        <Title order={5} mb="sm">Unsigned</Title>
                                        {unsignedDocuments.length === 0 ? (
                                            <Text c="dimmed">No unsigned document requests.</Text>
                                        ) : (
                                            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                                                {unsignedDocuments.map((document) => {
                                                    const childMustSignFromOwnAccount = Boolean(
                                                        document.signerContext === 'child'
                                                        && document.childUserId
                                                        && document.childUserId !== user?.$id,
                                                    );
                                                    return (
                                                    <Paper
                                                        key={document.id}
                                                        withBorder
                                                        radius="md"
                                                        p="md"
                                                        shadow="xs"
                                                        style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                                                    >
                                                        <div className="space-y-2">
                                                            <Badge color="yellow" variant="light">Unsigned</Badge>
                                                            <Text fw={700}>{document.title}</Text>
                                                            <Text size="sm" c="dimmed">{document.organizationName}</Text>
                                                            <Text size="xs" c="dimmed">
                                                                Event: {document.eventName ?? 'Event'}
                                                            </Text>
                                                            <Text size="xs" c="dimmed">
                                                                Signer: {document.signerContextLabel}
                                                            </Text>
                                                            <Text size="xs" c="dimmed">
                                                                Required: {document.requiredSignerLabel}
                                                            </Text>
                                                            {document.consentStatus && (
                                                                <Text size="xs" c="dimmed">
                                                                    Consent status: {document.consentStatus}
                                                                </Text>
                                                            )}
                                                            {document.statusNote && (
                                                                <Alert color="yellow" variant="light" mt="xs">
                                                                    {document.statusNote}
                                                                </Alert>
                                                            )}
                                                        </div>
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            mt="md"
                                                            disabled={Boolean(document.requiresChildEmail) || childMustSignFromOwnAccount}
                                                            onClick={() => handleStartSigningDocument(document)}
                                                        >
                                                            {document.requiresChildEmail
                                                                ? 'Add child email first'
                                                                : childMustSignFromOwnAccount
                                                                    ? 'Child must sign'
                                                                    : 'Sign document'}
                                                        </Button>
                                                    </Paper>
                                                    );
                                                })}
                                            </SimpleGrid>
                                        )}
                                    </div>

                                    <div>
                                        <Title order={5} mb="sm">Signed</Title>
                                        {signedDocuments.length === 0 ? (
                                            <Text c="dimmed">No signed documents yet.</Text>
                                        ) : (
                                            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                                                {signedDocuments.map((document) => (
                                                    <Paper
                                                        key={document.id}
                                                        withBorder
                                                        radius="md"
                                                        p="md"
                                                        shadow="xs"
                                                        style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                                                    >
                                                        <div className="space-y-2">
                                                            <Badge color="green" variant="light">Signed</Badge>
                                                            <Text fw={700}>{document.title}</Text>
                                                            <Text size="sm" c="dimmed">{document.organizationName}</Text>
                                                            <Text size="xs" c="dimmed">
                                                                Event: {document.eventName ?? 'Event'}
                                                            </Text>
                                                            <Text size="xs" c="dimmed">
                                                                Signed: {formatDateTimeLabel(document.signedAt)}
                                                            </Text>
                                                        </div>
                                                        <Button
                                                            size="xs"
                                                            variant="light"
                                                            mt="md"
                                                            onClick={() => handleOpenSignedDocument(document)}
                                                        >
                                                            {document.type === 'PDF' ? 'View document' : 'Preview text'}
                                                        </Button>
                                                    </Paper>
                                                ))}
                                            </SimpleGrid>
                                        )}
                                    </div>
                                </div>
                            )}
                        </Paper>
                    </div>

                    <div className="mt-8">
                        <Paper withBorder radius="lg" p="md" shadow="sm">
                            <Group justify="space-between" mb="sm">
                                <Title order={4}>Event Templates</Title>
                                <Group>
                                    <Button variant="light" size="xs" onClick={loadEventTemplates} loading={loadingEventTemplates}>
                                        Refresh
                                    </Button>
                                </Group>
                            </Group>
                            <Text size="sm" c="dimmed" mb="sm">
                                Reusable templates for personal (non-organization) events.
                            </Text>
                            {eventTemplatesError && (
                                <Alert color="red" mb="sm">
                                    {eventTemplatesError}
                                </Alert>
                            )}
                            {loadingEventTemplates ? (
                                <Text c="dimmed">Loading event templates...</Text>
                            ) : eventTemplates.length === 0 ? (
                                <Text c="dimmed">No event templates yet.</Text>
                            ) : (
                                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                                    {eventTemplates.map((template) => (
                                        <Paper
                                            key={template.id}
                                            withBorder
                                            radius="md"
                                            p="md"
                                            shadow="xs"
                                            style={{ aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                                        >
                                            <div className="space-y-2">
                                                <Badge color="blue" variant="light">Event Template</Badge>
                                                <Text fw={700}>{template.name}</Text>
                                                {template.start && (
                                                    <Text size="xs" c="dimmed">
                                                        Starts: {formatDateTimeLabel(template.start)}
                                                    </Text>
                                                )}
                                                {template.end && (
                                                    <Text size="xs" c="dimmed">
                                                        Ends: {formatDateTimeLabel(template.end)}
                                                    </Text>
                                                )}
                                            </div>
                                            <Button
                                                size="xs"
                                                variant="light"
                                                mt="md"
                                                onClick={() => router.push(`/events/${template.id}/schedule`)}
                                            >
                                                Open template
                                            </Button>
                                        </Paper>
                                    ))}
                                </SimpleGrid>
                            )}
                        </Paper>
                    </div>

                    {/* Account Settings */}
                    {!isEditing && (
                        <div className="mt-8 space-y-6">
                            {/* Payments */}
                            <Paper withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm">
                                    <Title order={4}>Payments</Title>
                                </Group>
                                <Text c="dimmed" mb="sm">
                                    {userHasStripeAccount
                                        ? 'Manage your Stripe account to update payout details.'
                                        : 'Connect a Stripe account to accept payments for your events and rentals.'}
                                </Text>
                            <Button
                                loading={userHasStripeAccount ? managingStripe : connectingStripe}
                                onClick={userHasStripeAccount ? handleManageStripeAccount : handleConnectStripeAccount}
                            >
                                {userHasStripeAccount ? 'Manage Stripe Account' : 'Connect Stripe Account'}
                            </Button>
                        </Paper>

                            <Paper withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm">
                                    <Title order={4}>Bills</Title>
                                    <Button variant="light" size="xs" onClick={loadBills} loading={loadingBills}>
                                        Refresh
                                    </Button>
                                </Group>
                                {billError && (
                                    <Alert color="red" mb="sm">
                                        {billError}
                                    </Alert>
                                )}
                                {loadingBills ? (
                                    <Text c="dimmed">Loading bills...</Text>
                                ) : bills.length === 0 ? (
                                    <Text c="dimmed">No bills available.</Text>
                                ) : (
                                    <SimpleGrid
                                        cols={3}
                                        spacing="md"
                                        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
                                    >
                                        {bills.map((bill) => {
                                            const remaining = Math.max(bill.totalAmountCents - bill.paidAmountCents, 0);
                                            const nextAmount =
                                                bill.nextPaymentAmountCents !== null && bill.nextPaymentAmountCents !== undefined
                                                    ? bill.nextPaymentAmountCents
                                                    : remaining;
                                            const nextDue = bill.nextPaymentDue
                                                ? formatDisplayDate(bill.nextPaymentDue)
                                                : 'TBD';
                                            const ownerName =
                                                bill.ownerLabel ??
                                                (bill.ownerType === 'TEAM'
                                                    ? userTeams[bill.ownerId]?.name ?? 'Team'
                                                    : user.fullName);
                                            return (
                                                <Paper
                                                    key={bill.$id}
                                                    withBorder
                                                    radius="md"
                                                    p="md"
                                                    shadow="xs"
                                                    style={{ maxWidth: 380, width: '100%' }}
                                                >
                                                    <div className="space-y-2">
                                                        <div>
                                                            <Text fw={700} size="lg">
                                                                {ownerName}
                                                            </Text>
                                                            <Text size="sm" c="dimmed">
                                                                Bill #{bill.$id.slice(0, 6)} • {bill.status}
                                                            </Text>
                                                            <Text size="sm" c="dimmed">
                                                                Next due: {nextDue}
                                                            </Text>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Text size="sm" fw={500}>Total: {formatBillAmount(bill.totalAmountCents)}</Text>
                                                            <Text size="sm" fw={500}>Paid: {formatBillAmount(bill.paidAmountCents)}</Text>
                                                            <Text size="sm" fw={500}>Next: {formatBillAmount(nextAmount)}</Text>
                                                        </div>
                                                        <Group gap="xs" justify="flex-end">
                                                            {bill.ownerType === 'TEAM' && bill.allowSplit && (
                                                                <Button
                                                                    size="xs"
                                                                    variant="default"
                                                                    loading={splittingBillId === bill.$id}
                                                                    onClick={() => handleSplitBill(bill)}
                                                                >
                                                                    Split across team
                                                                </Button>
                                                            )}
                                                            <Button size="xs" onClick={() => handlePayBill(bill)} disabled={nextAmount <= 0}>
                                                                Pay next installment
                                                            </Button>
                                                        </Group>
                                                    </div>
                                                </Paper>
                                            );
                                        })}
                                    </SimpleGrid>
                                )}
                            </Paper>

                            <Paper withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm">
                                    <Title order={4}>Memberships</Title>
                                    <Button variant="light" size="xs" onClick={loadSubscriptions} loading={loadingSubscriptions}>
                                        Refresh
                                    </Button>
                                </Group>
                                {subscriptionError && (
                                    <Alert color="red" mb="sm">
                                        {subscriptionError}
                                    </Alert>
                                )}
                                {loadingSubscriptions ? (
                                    <Loading fullScreen={false} text="Loading memberships..." />
                                ) : subscriptions.length === 0 ? (
                                    <Text c="dimmed">No active memberships.</Text>
                                ) : (
                                    <SimpleGrid
                                        cols={3}
                                        spacing="md"
                                        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
                                    >
                                        {subscriptions.map((sub) => {
                                            const status = sub.status || 'ACTIVE';
                                            const isCancelled = status === 'CANCELLED';
                                            const statusColor = isCancelled ? 'red' : 'green';
                                            const product = productsById[sub.productId];
                                            const organization = sub.organizationId
                                                ? organizationsById[sub.organizationId]
                                                : undefined;
                                            const membershipTitle = product?.name ?? sub.productId ?? 'Membership';
                                            const organizationLabel = organization?.name
                                                ? organization.name
                                                : sub.organizationId
                                                    ? `Organization ${sub.organizationId}`
                                                    : 'Organization';
                                            return (
                                                <Paper key={sub.$id} withBorder radius="md" p="md" shadow="xs">
                                                    <div className="space-y-2">
                                                        <Text fw={700} size="md">
                                                            {membershipTitle}
                                                        </Text>
                                                        <Text size="sm" c="dimmed">
                                                            {organizationLabel}
                                                        </Text>
                                                        <Text size="sm">
                                                            {formatPrice(sub.priceCents)} / {sub.period}
                                                        </Text>
                                                        <Text size="sm" c={statusColor}>
                                                            Status: {status}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            Started {formatDisplayDate(sub.startDate)}
                                                        </Text>
                                                        {isCancelled ? (
                                                            <Button
                                                                variant="light"
                                                                color="green"
                                                                size="xs"
                                                                fullWidth
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
                                                                loading={cancellingSubId === sub.$id}
                                                                onClick={() => handleCancelSubscription(sub.$id)}
                                                            >
                                                                Cancel membership
                                                            </Button>
                                                        )}
                                                    </div>
                                                </Paper>
                                            );
                                        })}
                                    </SimpleGrid>
                                )}
                            </Paper>
                            <div className="space-y-6">
                                <RefundRequestsList userId={user.$id} />
                                <RefundRequestsList hostId={user.$id} />
                            </div>

                            {/* Email Section */}
                            <Paper withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm">
                                    <Title order={4}>Email Address</Title>
                                    <Button variant="subtle" onClick={() => setShowEmailSection(!showEmailSection)}>
                                        {showEmailSection ? 'Cancel' : 'Change Email'}
                                    </Button>
                                </Group>

                                {showEmailSection ? (
                                    <div className="space-y-4">
                                        <TextInput
                                            type="email"
                                            placeholder="New email address"
                                            value={emailData.email}
                                            onChange={(event) => {
                                                const value = event.currentTarget.value;
                                                setEmailData((prev) => ({ ...prev, email: value }));
                                            }}
                                        />
                                        <TextInput
                                            type="password"
                                            placeholder="Current password"
                                            value={emailData.currentPassword}
                                            onChange={(event) => {
                                                const value = event.currentTarget.value;
                                                setEmailData((prev) => ({ ...prev, currentPassword: value }));
                                            }}
                                        />
                                        <Button onClick={handleEmailUpdate} disabled={saving || !emailData.email || !emailData.currentPassword}>Update Email</Button>
                                    </div>
                                ) : (
                                    <Text c="dimmed">{'Click "Change Email" to update your email address'}</Text>
                                )}
                            </Paper>

                            {/* Password Section */}
                            <Paper withBorder radius="md" p="md">
                                <Group justify="space-between" mb="sm">
                                    <Title order={4}>Password</Title>
                                    <Button variant="subtle" onClick={() => setShowPasswordSection(!showPasswordSection)}>
                                        {showPasswordSection ? 'Cancel' : 'Change Password'}
                                    </Button>
                                </Group>

                                {showPasswordSection ? (
                                    <div className="space-y-4">
                                        <TextInput
                                            type="password"
                                            placeholder="Current password"
                                            value={passwordData.currentPassword}
                                            onChange={(event) => {
                                                const value = event.currentTarget.value;
                                                setPasswordData((prev) => ({ ...prev, currentPassword: value }));
                                            }}
                                        />
                                        <TextInput
                                            type="password"
                                            placeholder="New password"
                                            value={passwordData.newPassword}
                                            onChange={(event) => {
                                                const value = event.currentTarget.value;
                                                setPasswordData((prev) => ({ ...prev, newPassword: value }));
                                            }}
                                        />
                                        <TextInput
                                            type="password"
                                            placeholder="Confirm new password"
                                            value={passwordData.confirmPassword}
                                            onChange={(event) => {
                                                const value = event.currentTarget.value;
                                                setPasswordData((prev) => ({ ...prev, confirmPassword: value }));
                                            }}
                                        />
                                        <Button onClick={handlePasswordUpdate} disabled={saving || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}>Update Password</Button>
                                    </div>
                                ) : (
                                    <Text c="dimmed">{'Click "Change Password" to update your password'}</Text>
                                )}
                            </Paper>
                        </div>
                    )}
                </Container>

                <Modal
                    opened={Boolean(selectedSignedTextDocument)}
                    onClose={() => setSelectedSignedTextDocument(null)}
                    centered
                    title={selectedSignedTextDocument ? `Signed text: ${selectedSignedTextDocument.title}` : 'Signed text'}
                >
                    {selectedSignedTextDocument ? (
                        <Stack gap="sm">
                            <Text size="sm" c="dimmed">
                                Signed at {formatDateTimeLabel(selectedSignedTextDocument.signedAt)}
                            </Text>
                            {selectedSignedTextDocument.eventName && (
                                <Text size="sm" c="dimmed">
                                    Event: {selectedSignedTextDocument.eventName}
                                </Text>
                            )}
                            <Paper withBorder radius="md" p="sm" style={{ maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                {selectedSignedTextDocument.content || 'No text content is available for this document.'}
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
                                {signLinks[currentSignIndex]?.title ? ` • ${signLinks[currentSignIndex]?.title}` : ''}
                            </Text>
                            {signLinks[currentSignIndex]?.requiredSignerLabel && (
                                <Text size="xs" c="dimmed">
                                    Required signer: {signLinks[currentSignIndex]?.requiredSignerLabel}
                                </Text>
                            )}
                            {signLinks[currentSignIndex]?.type === 'TEXT' ? (
                                <Stack gap="sm">
                                    <Paper withBorder p="sm" radius="md" style={{ maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                        {signLinks[currentSignIndex]?.content || 'No waiver text provided.'}
                                    </Paper>
                                    <Checkbox
                                        label="I have read and agree to this document."
                                        checked={textAccepted}
                                        onChange={(event) => setTextAccepted(event.currentTarget.checked)}
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
                                        style={{ width: '100%', height: 520, border: '1px solid #E5E7EB', borderRadius: 8 }}
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
                        name: payingBill ? 'Bill payment' : 'Bill',
                        location: '',
                        eventType: 'EVENT',
                        price:
                            payingBill?.nextPaymentAmountCents ??
                            Math.max((payingBill?.totalAmountCents || 0) - (payingBill?.paidAmountCents || 0), 0),
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
