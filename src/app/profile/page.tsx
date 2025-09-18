'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/app/providers';
import { userService } from '@/lib/userService';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { getUserAvatarUrl } from '@/types';
import Loading from '@/components/ui/Loading';
import Navigation from '@/components/layout/Navigation';
import { Container, Group, Title, Text, Button, Paper, TextInput, Alert, Avatar, SimpleGrid } from '@mantine/core';

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

                    {/* Account Settings */}
                    {!isEditing && (
                        <div className="mt-8 space-y-6">
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
            </div>
        </>
    );
}
