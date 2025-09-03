import React from 'react';

interface ParticipantsPreviewProps {
    title: string;
    participants: any[];
    totalCount: number;
    isLoading: boolean;
    onClick: () => void;
    getAvatarUrl: (participant: any) => string;
    emptyMessage: string;
}

export default function ParticipantsPreview({
    title,
    participants,
    totalCount,
    isLoading,
    onClick,
    getAvatarUrl,
    emptyMessage
}: ParticipantsPreviewProps) {
    if (totalCount === 0 && !isLoading) {
        return (
            <div className="text-center py-4 text-gray-500 text-sm">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div
            className="bg-gray-50 rounded-lg p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">{title}</h4>
                <div className="text-sm text-gray-600">
                    {totalCount} {totalCount === 1 ? title.slice(0, -1).toLowerCase() : title.toLowerCase()}
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center space-x-2">
                    <div className="animate-pulse flex space-x-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="w-8 h-8 bg-gray-300 rounded-full"></div>
                        ))}
                    </div>
                    <span className="text-sm text-gray-500 ml-2">Loading...</span>
                </div>
            ) : (
                <div className="flex items-center">
                    {/* Avatar Stack */}
                    <div className="flex -space-x-2 mr-3">
                        {participants.slice(0, 3).map((participant, index) => (
                            <img
                                key={participant.$id}
                                src={getAvatarUrl(participant)}
                                alt=""
                                className="w-8 h-8 rounded-full border-2 border-white object-cover"
                                style={{ zIndex: 3 - index }}
                            />
                        ))}

                        {/* Fade effect for additional participants */}
                        {totalCount > 3 && (
                            <div className="relative">
                                <div
                                    className="w-8 h-8 rounded-full border-2 border-white bg-gradient-to-r from-transparent to-gray-200 flex items-center justify-center"
                                    style={{ zIndex: 0 }}
                                >
                                    <span className="text-xs font-medium text-gray-600">+{totalCount - 3}</span>
                                </div>
                                {/* Fade overlay */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-gray-50 to-gray-50 rounded-full opacity-60"></div>
                            </div>
                        )}
                    </div>

                    {/* View All Link */}
                    <div className="flex items-center text-sm text-blue-600 hover:text-blue-700">
                        <span>View all</span>
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
}
