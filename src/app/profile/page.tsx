'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useApp } from '@/app/providers';
import { userService } from '@/lib/userService';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Bill, PaymentIntent, Team, getUserAvatarUrl, formatPrice, formatBillAmount } from '@/types';
import Loading from '@/components/ui/Loading';
import Navigation from '@/components/layout/Navigation';
import { Container, Group, Title, Text, Button, Paper, TextInput, Alert, Avatar, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { paymentService } from '@/lib/paymentService';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import { billService } from '@/lib/billService';
import { teamService } from '@/lib/teamService';
import PaymentModal from '@/components/ui/PaymentModal';
import { ManageTeams } from '@/app/teams/page';
import RefundRequestsList from '@/components/ui/RefundRequestsList';

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
        profileImageId: ''
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

    const userHasStripeAccount = Boolean(user?.hasStripeAccount || user?.stripeAccountId);

    // Initialize form data when user changes
    useEffect(() => {
        if (user) {
            setProfileData({
                firstName: user.firstName,
                lastName: user.lastName,
                userName: user.userName,
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
            const updatedUser = await userService.updateProfile(user.$id, {
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                userName: profileData.userName,
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

    useEffect(() => {
        if (user) {
            loadBills();
        }
    }, [user, loadBills]);

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
                                        src={profileData.profileImageId || getUserAvatarUrl(user, 128)}
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
                                        currentImageUrl={profileData.profileImageId}
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
                                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                                            <p className="text-2xl font-bold text-purple-600">{user.eventInvites.length}</p>
                                            <p className="text-gray-600">Event Invites</p>
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

                            <RefundRequestsList userId={user.$id} hostId={user.$id} />

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
                            <RefundRequestsList userId={user.$id} />
                            <RefundRequestsList userId={user.$id} hostId={user.$id} />

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
                                    <div className="space-y-3">
                                        {bills.map((bill) => {
                                            const remaining = Math.max(bill.totalAmountCents - bill.paidAmountCents, 0);
                                            const nextAmount =
                                                bill.nextPaymentAmountCents !== null && bill.nextPaymentAmountCents !== undefined
                                                    ? bill.nextPaymentAmountCents
                                                    : remaining;
                                            const nextDue = bill.nextPaymentDue
                                                ? new Date(bill.nextPaymentDue).toLocaleDateString()
                                                : 'TBD';
                                            return (
                                                <Paper key={bill.$id} withBorder radius="md" p="sm">
                                                    <Group justify="space-between" align="center">
                                                        <div>
                                                            <Text fw={600}>Bill {bill.$id.slice(0, 6)}</Text>
                                                            <Text size="sm" c="dimmed">
                                                                Status: {bill.status} - Next due: {nextDue}
                                                            </Text>
                                                            <Text size="sm" c="dimmed">
                                                                Owner: {bill.ownerLabel ?? (bill.ownerType === 'TEAM' ? 'Team' : 'You')}
                                                            </Text>
                                                        </div>
                                                        <div className="text-right space-y-1">
                                                            <Text size="sm">Total: {formatPrice(bill.totalAmountCents)}</Text>
                                                            <Text size="sm">Paid: {formatPrice(bill.paidAmountCents)}</Text>
                                                            <Text size="sm">Next: {formatPrice(nextAmount)}</Text>
                                                            <Button size="xs" onClick={() => handlePayBill(bill)} disabled={nextAmount <= 0}>
                                                                Pay next installment
                                                            </Button>
                                                        </div>
                                                    </Group>
                                                </Paper>
                                            );
                                        })}
                                    </div>
                                )}
                            </Paper>

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
                                    <Text c="dimmed">Click "Change Email" to update your email address</Text>
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
                                    <Text c="dimmed">Click "Change Password" to update your password</Text>
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
