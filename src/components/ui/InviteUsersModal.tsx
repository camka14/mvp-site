'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { userService } from '@/lib/userService';
import { useChat } from '@/context/ChatContext';
import { useChatUI } from '@/context/ChatUIContext';

interface User {
    $id: string;
    firstName: string;
    lastName: string;
    userName: string;
    profileImage?: string;
}

export function InviteUsersModal() {
    const { isInviteModalOpen, setInviteModalOpen } = useChatUI();
    const { createChatGroup } = useChat();

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Search users with debounce
    useEffect(() => {
        if (searchQuery.length < 2) {
            setSearchResults([]);
            return;
        }

        const searchUsers = async () => {
            setSearching(true);
            try {
                const results = await userService.searchUsers(searchQuery);
                const filteredResults = results.filter(user =>
                    !selectedUsers.some(selected => selected.$id === user.$id)
                );
                setSearchResults(filteredResults);
            } catch (error) {
                console.error('Failed to search users:', error);
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        };

        const timeoutId = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery, selectedUsers]);

    const handleAddUser = (user: User) => {
        setSelectedUsers(prev => [...prev, user]);
        setSearchResults(prev => prev.filter(u => u.$id !== user.$id));
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers(prev => prev.filter(u => u.$id !== userId));
    };

    const handleClose = () => {
        setInviteModalOpen(false);
        setSelectedUsers([]);
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleSubmit = async () => {
        if (selectedUsers.length === 0) return;

        setLoading(true);
        try {
            const defaultName = selectedUsers.length === 1
                ? `Chat with ${selectedUsers[0].firstName} ${selectedUsers[0].lastName}`
                : `Group Chat`;

            const userIds = selectedUsers.map(u => u.$id);
            await createChatGroup(defaultName, userIds);
            handleClose();
        } catch (error) {
            console.error('Failed to create chat:', error);
        } finally {
            setLoading(false);
        }
    };

    const getUserAvatar = (user: User) => {
        if (user.profileImage) return user.profileImage;

        const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
        return `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
        <rect width="40" height="40" fill="#3B82F6"/>
        <text x="20" y="26" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${initials}</text>
      </svg>`
        )}`;
    };

    if (!mounted || !isInviteModalOpen) return null;

    const modalContent = (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">Create New Chat</h3>
                        <p className="text-sm text-gray-600 mt-1">Search and select users to start a conversation</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col max-h-[calc(80vh-8rem)]">
                    {/* Search Section */}
                    <div className="p-6 border-b border-gray-100">
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by name or username..."
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                autoFocus
                            />
                            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>

                        {searchQuery.length > 0 && searchQuery.length < 2 && (
                            <p className="text-sm text-gray-500 mt-2">Type at least 2 characters to search for users</p>
                        )}
                    </div>

                    {/* Selected Users */}
                    {selectedUsers.length > 0 && (
                        <div className="p-6 border-b border-gray-100">
                            <h4 className="text-sm font-medium text-gray-900 mb-3">
                                Selected Users ({selectedUsers.length})
                            </h4>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                {selectedUsers.map((user) => (
                                    <div key={user.$id} className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                                        <div className="flex items-center space-x-3">
                                            <img
                                                src={getUserAvatar(user)}
                                                alt={`${user.firstName} ${user.lastName}`}
                                                className="w-8 h-8 rounded-full"
                                            />
                                            <div>
                                                <p className="font-medium text-gray-900 text-sm">
                                                    {user.firstName} {user.lastName}
                                                </p>
                                                <p className="text-xs text-gray-500">@{user.userName}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveUser(user.$id)}
                                            className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                                        >
                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Search Results */}
                    <div className="flex-1 overflow-y-auto">
                        {searching && (
                            <div className="p-6 text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                <p className="text-sm text-gray-500 mt-2">Searching...</p>
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <div className="p-4">
                                <div className="space-y-2">
                                    {searchResults.map((user) => (
                                        <button
                                            key={user.$id}
                                            onClick={() => handleAddUser(user)}
                                            className="w-full p-3 hover:bg-gray-50 flex items-center space-x-3 text-left rounded-lg transition-colors"
                                        >
                                            <img
                                                src={getUserAvatar(user)}
                                                alt={`${user.firstName} ${user.lastName}`}
                                                className="w-10 h-10 rounded-full"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">
                                                    {user.firstName} {user.lastName}
                                                </p>
                                                <p className="text-sm text-gray-500 truncate">@{user.userName}</p>
                                            </div>
                                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                            <div className="p-6 text-center text-gray-500">
                                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <p className="text-sm">No users found matching "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={selectedUsers.length === 0 || loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                        {loading ? (
                            <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Creating...</span>
                            </div>
                        ) : (
                            `Create Chat ${selectedUsers.length > 0 ? `(${selectedUsers.length})` : ''}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
