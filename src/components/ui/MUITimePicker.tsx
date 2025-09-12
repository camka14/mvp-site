// MUITimePicker.tsx
import React from 'react';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TextField } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Label } from '@/components/ui/label';

// Create a theme that matches your design system
const theme = createTheme({
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            height: '42px',
            borderRadius: '0.375rem',
            fontFamily: 'inherit',
            fontSize: '1rem',
            '& fieldset': {
              borderColor: '#d1d5db',
            },
            '&:hover fieldset': {
              borderColor: '#9ca3af',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#3b82f6',
              borderWidth: '2px',
            },
          },
          '& .MuiInputBase-input': {
            padding: '0.75rem',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        },
      },
    },
  },
});

interface MUITimePickerProps {
  value: string; // Format: "h:mm a" for 12-hour or "HH:mm" for 24-hour
  onChange: (time: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  ampm?: boolean; // Add this prop
  format?: string; // Add this prop
}

export const MUITimePicker: React.FC<MUITimePickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  className = "",
  ampm = true, // Default to 12-hour format
  format = "h:mm a", // Default format for 12-hour
}) => {
  const parseTimeString = (timeString: string): Date => {
    const date = new Date();

    if (ampm && timeString.includes(' ')) {
      // Handle 12-hour format like "2:30 PM"
      const [timePart, meridiem] = timeString.split(' ');
      const [hours, minutes] = timePart.split(':');
      let hour24 = parseInt(hours, 10);

      if (meridiem.toUpperCase() === 'PM' && hour24 !== 12) {
        hour24 += 12;
      } else if (meridiem.toUpperCase() === 'AM' && hour24 === 12) {
        hour24 = 0;
      }

      date.setHours(hour24);
      date.setMinutes(parseInt(minutes, 10));
    } else {
      // Handle 24-hour format like "14:30"
      const [hours, minutes] = timeString.split(':');
      date.setHours(parseInt(hours, 10));
      date.setMinutes(parseInt(minutes, 10));
    }

    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  };

  const formatTimeToString = (date: Date | null): string => {
    if (!date) return ampm ? '12:00 AM' : '12:00';

    if (ampm) {
      // Format as 12-hour with AM/PM
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampmSuffix = hours >= 12 ? 'PM' : 'AM';

      if (hours === 0) {
        hours = 12;
      } else if (hours > 12) {
        hours -= 12;
      }

      return `${hours}:${minutes.toString().padStart(2, '0')} ${ampmSuffix}`;
    } else {
      // Format as 24-hour
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
  };

  const handleTimeChange = (newValue: Date | null) => {
    if (newValue) {
      onChange(formatTimeToString(newValue));
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <div className={className}>
          {label && <Label className="mb-2 block">{label}</Label>}
          <TimePicker
            value={parseTimeString(value)}
            onChange={handleTimeChange}
            disabled={disabled}
            ampm={ampm} // Enable 12-hour format with AM/PM
            format={format} // Set the display format
            enableAccessibleFieldDOMStructure={false} // Add this line to fix the error
            slots={{
              textField: TextField, // Use slots instead of renderInput
            }}
            slotProps={{
              textField: {
                fullWidth: true,
                variant: 'outlined',
                size: 'small',
              },
            }}
          />
        </div>
      </LocalizationProvider>
    </ThemeProvider>
  );
};
