'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useApp } from '@/app/providers';
import { userService } from '@/lib/userService';
import { familyService, FamilyChild } from '@/lib/familyService';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Bill, PaymentIntent, Team, getUserAvatarUrl, formatPrice, formatBillAmount, Product, Organization } from '@/types';
import type { Subscription } from '@/types';
import Loading from '@/components/ui/Loading';
import Navigation from '@/components/layout/Navigation';
import { Container, Group, Title, Text, Button, Paper, TextInput, Alert, Avatar, SimpleGrid, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { paymentService } from '@/lib/paymentService';
import { billService } from '@/lib/billService';
import { teamService } from '@/lib/teamService';
import PaymentModal from '@/components/ui/PaymentModal';
import { ManageTeams } from '@/app/teams/page';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import { productService } from '@/lib/productService';
import { organizationService } from '@/lib/organizationService';

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
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', year: 'numeric', month: 'long', day: '2-digit' }).format(date);
};

export default function ProfilePage() {
    const { user, loading, setUser } = useApp();
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
    const [creatingChild, setCreatingChild] = useState(false);
    const [linkingChild, setLinkingChild] = useState(false);
    const [childFormError, setChildFormError] = useState<string | null>(null);
    const [linkFormError, setLinkFormError] = useState<string | null>(null);
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

    const userHasStripeAccount = Boolean(user?.hasStripeAccount || user?.stripeAccountId);
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

    useEffect(() => {
        if (user) {
            loadChildren();
        }
    }, [user, loadChildren]);

    const handleCreateChild = async () => {
        if (!childForm.firstName.trim() || !childForm.lastName.trim() || !childForm.dateOfBirth.trim()) {
            setChildFormError('First name, last name, and date of birth are required.');
            return;
        }
        setCreatingChild(true);
        setChildFormError(null);
        try {
            await familyService.createChildAccount({
                firstName: childForm.firstName.trim(),
                lastName: childForm.lastName.trim(),
                email: childForm.email.trim() || undefined,
                dateOfBirth: childForm.dateOfBirth.trim(),
                relationship: childForm.relationship,
            });
            setChildForm({
                firstName: '',
                lastName: '',
                email: '',
                dateOfBirth: '',
                relationship: 'parent',
            });
            await loadChildren();
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
            await loadChildren();
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

    useEffect(() => {
        if (user) {
            loadBills();
            loadSubscriptions();
        }
    }, [user, loadBills, loadSubscriptions]);

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
                                        bucketId={process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!}
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
                                            <TextInput value={profileData.firstName} onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.currentTarget.value }))} required />
                                        ) : (
                                            <p className="text-gray-900 py-2">{user.firstName}</p>
                                        )}
                                    </div>

                                    {/* Last Name */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>Last Name</Text>
                                        {isEditing ? (
                                            <TextInput value={profileData.lastName} onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.currentTarget.value }))} required />
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
                                            <TextInput value={profileData.userName} onChange={(e) => setProfileData(prev => ({ ...prev, userName: e.currentTarget.value }))} required />
                                        ) : (
                                            <p className="text-gray-900 py-2">@{user.userName}</p>
                                        )}
                                    </div>

                                    {/* Member Since */}
                                    <div>
                                        <Text size="sm" fw={500} mb={4}>Member Since</Text>
                                        <p className="text-gray-900 py-2">
                                            {user.$createdAt ? new Date(user.$createdAt).toLocaleDateString() : 'Unknown'}
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
                                <Title order={4}>Children</Title>
                                <Button variant="light" size="xs" onClick={loadChildren} loading={childrenLoading}>
                                    Refresh
                                </Button>
                            </Group>
                            {childrenError && (
                                <Alert color="red" mb="sm">
                                    {childrenError}
                                </Alert>
                            )}
                            {childrenLoading ? (
                                <Text c="dimmed">Loading children...</Text>
                            ) : children.length === 0 ? (
                                <Text c="dimmed">No children linked yet.</Text>
                            ) : (
                                <SimpleGrid
                                    cols={3}
                                    spacing="md"
                                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
                                >
                                    {children.map((child) => {
                                        const name = `${child.firstName || ''} ${child.lastName || ''}`.trim();
                                        const hasEmail = typeof child.hasEmail === 'boolean'
                                            ? child.hasEmail
                                            : Boolean(child.email);
                                        return (
                                            <Paper key={child.userId} withBorder radius="md" p="md" shadow="xs">
                                                <Text fw={600}>{name || 'Child'}</Text>
                                                <Text size="sm" c="dimmed">
                                                    Age: {typeof child.age === 'number' ? child.age : 'Unknown'}
                                                </Text>
                                                <Text size="sm" c="dimmed">
                                                    Status: {child.linkStatus ?? 'Unknown'}
                                                </Text>
                                                {!hasEmail && (
                                                    <Alert color="yellow" variant="light" mt="sm">
                                                        Missing email. Consent links cannot be sent until an email is added.
                                                    </Alert>
                                                )}
                                            </Paper>
                                        );
                                    })}
                                </SimpleGrid>
                            )}

                            <SimpleGrid
                                cols={2}
                                spacing="lg"
                                mt="lg"
                                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
                            >
                                <div className="space-y-3">
                                    <Title order={5}>Add a child</Title>
                                    {childFormError && (
                                        <Alert color="red" variant="light">
                                            {childFormError}
                                        </Alert>
                                    )}
                                    <TextInput
                                        label="First name"
                                        value={childForm.firstName}
                                        onChange={(event) => setChildForm(prev => ({ ...prev, firstName: event.currentTarget.value }))}
                                    />
                                    <TextInput
                                        label="Last name"
                                        value={childForm.lastName}
                                        onChange={(event) => setChildForm(prev => ({ ...prev, lastName: event.currentTarget.value }))}
                                    />
                                    <TextInput
                                        label="Email (optional)"
                                        value={childForm.email}
                                        onChange={(event) => setChildForm(prev => ({ ...prev, email: event.currentTarget.value }))}
                                    />
                                    <TextInput
                                        label="Date of birth"
                                        type="date"
                                        value={childForm.dateOfBirth}
                                        max={maxDob}
                                        onChange={(event) => setChildForm(prev => ({ ...prev, dateOfBirth: event.currentTarget.value }))}
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
                                    <Button onClick={handleCreateChild} loading={creatingChild}>
                                        Add child
                                    </Button>
                                </div>
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
                                        onChange={(event) => setLinkForm(prev => ({ ...prev, childEmail: event.currentTarget.value }))}
                                    />
                                    <TextInput
                                        label="Child user ID"
                                        value={linkForm.childUserId}
                                        onChange={(event) => setLinkForm(prev => ({ ...prev, childUserId: event.currentTarget.value }))}
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
                            </SimpleGrid>
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
                                                ? new Date(bill.nextPaymentDue).toLocaleDateString()
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
                                                            Started {new Date(sub.startDate).toLocaleDateString()}
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
                                        <TextInput type="email" placeholder="New email address" value={emailData.email} onChange={(e) => setEmailData(prev => ({ ...prev, email: e.currentTarget.value }))} />
                                        <TextInput type="password" placeholder="Current password" value={emailData.currentPassword} onChange={(e) => setEmailData(prev => ({ ...prev, currentPassword: e.currentTarget.value }))} />
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
                                        <TextInput type="password" placeholder="Current password" value={passwordData.currentPassword} onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.currentTarget.value }))} />
                                        <TextInput type="password" placeholder="New password" value={passwordData.newPassword} onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.currentTarget.value }))} />
                                        <TextInput type="password" placeholder="Confirm new password" value={passwordData.confirmPassword} onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.currentTarget.value }))} />
                                        <Button onClick={handlePasswordUpdate} disabled={saving || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}>Update Password</Button>
                                    </div>
                                ) : (
                                    <Text c="dimmed">{'Click "Change Password" to update your password'}</Text>
                                )}
                            </Paper>
                        </div>
                    )}
                </Container>
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
