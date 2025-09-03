// User types
export interface UserAccount {
  $id: string;
  email: string;
  name?: string;
  emailVerification?: boolean;
  phoneVerification?: boolean;
  prefs?: Record<string, any>;
}

export interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  userName: string;
  profileImage?: string;
  teamIds: string[];
  friendIds: string[];
  eventInvites: string[];
  hasStripeAccount?: boolean;
}

// Event types
export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  category: EventCategory;
  attendees: number;
  maxAttendees?: number;
  price?: number;
  image?: string;
  organizerId: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export type EventCategory = 
  | 'Volleyball'
  | 'Soccer' 
  | 'Basketball'
  | 'Tennis'
  | 'Pickleball'
  | 'Swimming'
  | 'Football'
  | 'Other';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

// Team types
export interface Team {
  id: string;
  name: string;
  description?: string;
  image?: string;
  playerIds: string[];
  captainId: string;
  sport: EventCategory;
  createdAt: string;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Form types
export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData extends LoginFormData {
  name: string;
  confirmPassword: string;
}

// Search and Filter types
export interface SearchFilters {
  query?: string;
  category?: EventCategory | 'All';
  date?: string;
  location?: string;
  priceRange?: {
    min: number;
    max: number;
  };
}

// Navigation types
export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<any>;
  badge?: string | number;
}
