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
  value: string; // Format: "HH:mm"
  onChange: (time: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const MUITimePicker: React.FC<MUITimePickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  className = "",
}) => {
  const parseTimeString = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10));
    date.setMinutes(parseInt(minutes, 10));
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
  };

  const formatTimeToString = (date: Date | null): string => {
    if (!date) return '12:00';
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleTimeChange = (newValue: Date | null) => {
    if (newValue) {
      onChange(formatTimeToString(newValue));
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <TimePicker
            value={parseTimeString(value)}
            onChange={handleTimeChange}
            disabled={disabled}
            ampm={false} // 24-hour format
            views={['hours', 'minutes']}
            format="HH:mm"
            slotProps={{
              textField: {
                fullWidth: true,
                variant: 'outlined',
                size: 'small',
              },
              desktopPaper: {
                sx: {
                  '& .MuiTimeClock-root': {
                    backgroundColor: 'white',
                  },
                  '& .MuiTimeClock-clock': {
                    backgroundColor: '#f9fafb',
                  },
                  '& .MuiClockPointer-root': {
                    backgroundColor: '#3b82f6',
                  },
                  '& .MuiClockPointer-thumb': {
                    backgroundColor: '#3b82f6',
                    border: '2px solid white',
                  },
                  '& .MuiClock-pin': {
                    backgroundColor: '#3b82f6',
                  },
                  '& .MuiClockNumber-root': {
                    '&.Mui-selected': {
                      backgroundColor: '#3b82f6',
                      color: 'white',
                    },
                  },
                },
              },
            }}
          />
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  );
};
