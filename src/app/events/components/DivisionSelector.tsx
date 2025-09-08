
import React, { useState } from 'react';

interface DivisionSelectorProps {
    selectedDivisions: string[];
    onChange: (divisions: string[]) => void;
    isValid: boolean;
}

const divisions = [
    'Beginner',
    'Intermediate',
    'Advanced',
    'Open',
    'Recreational',
    'Competitive',
    'Professional'
];

const DivisionSelector: React.FC<DivisionSelectorProps> = ({
    selectedDivisions,
    onChange,
    isValid
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleDivision = (division: string) => {
        const updated = selectedDivisions.includes(division)
            ? selectedDivisions.filter(d => d !== division)
            : [...selectedDivisions, division];
        onChange(updated);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Levels *
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full p-3 border rounded-md text-left ${isValid ? 'border-gray-300' : 'border-red-300'
                        }`}
                >
                    {selectedDivisions.length > 0
                        ? `${selectedDivisions.length} division${selectedDivisions.length > 1 ? 's' : ''} selected`
                        : 'Select skill levels'
                    }
                </button>

                {isOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                        {divisions.map(division => (
                            <label
                                key={division}
                                className="flex items-center p-2 hover:bg-gray-50 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedDivisions.includes(division)}
                                    onChange={() => toggleDivision(division)}
                                    className="mr-2"
                                />
                                {division}
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {!isValid && (
                <p className="text-red-500 text-sm mt-1">Please select at least one skill level</p>
            )}

            {selectedDivisions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDivisions.map(division => (
                        <span
                            key={division}
                            className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center"
                        >
                            {division}
                            <button
                                type="button"
                                onClick={() => toggleDivision(division)}
                                className="ml-1 text-blue-600 hover:text-blue-800"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DivisionSelector;
