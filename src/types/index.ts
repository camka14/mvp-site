// User types (unchanged)
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

// Unified Event interface (matching your new table structure)
export interface Event {
  id: string;
  name: string;
  description: string;
  start: string; // ISO-8601 string
  end: string; // ISO-8601 string
  location: string;
  lat: number;
  long: number;
  divisions: string[];
  fieldType: string;
  price: number;
  rating?: number;
  imageUrl: string;
  hostId: string;
  maxParticipants: number;
  teamSizeLimit: number;
  teamSignup: boolean;
  singleDivision: boolean;
  waitList: string[];
  freeAgents: string[];
  playerIds: string[];
  teamIds: string[];
  cancellationRefundHours: number;
  registrationCutoffHours: number;
  seedColor: number;
  isTaxed: boolean;
  createdAt: string;
  updatedAt: string;
  eventType: 'pickup' | 'tournament';
  sport: string;
  
  // Tournament-specific fields (only populated when eventType === 'tournament')
  doubleElimination?: boolean;
  winnerSetCount?: number;
  loserSetCount?: number;
  winnerBracketPointsToVictory?: number[];
  loserBracketPointsToVictory?: number[];
  winnerScoreLimitsPerSet?: number[];
  loserScoreLimitsPerSet?: number[];
  prize?: string;
  
  // Computed properties
  attendees: number; // Calculated from playerIds length
  coordinates: { lat: number; lng: number };
  category: EventCategory; // Derived from sport column
}

// Tournament and PickupEvent are now just type guards
export type Tournament = Event & { eventType: 'tournament' };
export type PickupEvent = Event & { eventType: 'pickup' };

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

// Helper functions
export function getCategoryFromEvent(event: Event): EventCategory {
  const sport = event.sport.toLowerCase();
  if (sport.includes('volleyball')) return 'Volleyball';
  if (sport.includes('soccer')) return 'Soccer';
  if (sport.includes('basketball')) return 'Basketball';
  if (sport.includes('tennis')) return 'Tennis';
  if (sport.includes('pickleball')) return 'Pickleball';
  if (sport.includes('swimming')) return 'Swimming';
  if (sport.includes('football')) return 'Football';
  return 'Other';
}

export function getEventDateTime(event: Event): { date: string; time: string } {
  const startDate = new Date(event.start);
  return {
    date: startDate.toISOString().split('T')[0],
    time: startDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    })
  };
}

// Type guards
export function isTournament(event: Event): event is Tournament {
  return event.eventType === 'tournament';
}

export function isPickupEvent(event: Event): event is PickupEvent {
  return event.eventType === 'pickup';
}

// Rest of existing types...
export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationInfo extends LocationCoordinates {
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData extends LoginFormData {
  name: string;
  confirmPassword: string;
}

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

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<any>;
  badge?: string | number;
}
