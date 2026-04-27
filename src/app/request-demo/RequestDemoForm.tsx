'use client';

import { ChangeEvent, FormEvent, useState } from 'react';

type DemoFormData = {
  name: string;
  email: string;
  organization: string;
  role: string;
  phone: string;
  eventType: string;
  eventVolume: string;
  message: string;
  companyWebsite: string;
};

const initialFormData: DemoFormData = {
  name: '',
  email: '',
  organization: '',
  role: '',
  phone: '',
  eventType: '',
  eventVolume: '',
  message: '',
  companyWebsite: '',
};

const eventTypes = [
  'Tournaments',
  'Leagues',
  'Club programs',
  'Facility rentals',
  'Camps or clinics',
  'Other',
];

const eventVolumes = [
  '1-5 events per year',
  '6-20 events per year',
  '21-50 events per year',
  '50+ events per year',
  'Not sure yet',
];

export default function RequestDemoForm() {
  const [formData, setFormData] = useState<DemoFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      const response = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          sourcePath: typeof window === 'undefined' ? '/request-demo' : window.location.href,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : 'Unable to submit the demo request right now.',
        );
      }

      setFormData(initialFormData);
      setSuccessMessage('Demo request sent. We will follow up by email.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit the demo request right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="landing-surface rounded-3xl p-6 sm:p-8" onSubmit={handleSubmit}>
      <input
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        name="companyWebsite"
        onChange={handleChange}
        tabIndex={-1}
        type="text"
        value={formData.companyWebsite}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="landing-form-label text-sm font-semibold">Name</span>
          <input
            autoComplete="name"
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            maxLength={120}
            name="name"
            onChange={handleChange}
            required
            type="text"
            value={formData.name}
          />
        </label>

        <label className="space-y-2">
          <span className="landing-form-label text-sm font-semibold">Work email</span>
          <input
            autoComplete="email"
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            maxLength={254}
            name="email"
            onChange={handleChange}
            required
            type="email"
            value={formData.email}
          />
        </label>

        <label className="space-y-2">
          <span className="landing-form-label text-sm font-semibold">Organization</span>
          <input
            autoComplete="organization"
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            maxLength={160}
            name="organization"
            onChange={handleChange}
            required
            type="text"
            value={formData.organization}
          />
        </label>

        <label className="space-y-2">
          <span className="landing-form-label text-sm font-semibold">Role</span>
          <input
            autoComplete="organization-title"
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            maxLength={120}
            name="role"
            onChange={handleChange}
            type="text"
            value={formData.role}
          />
        </label>

        <label className="space-y-2">
          <span className="landing-form-label text-sm font-semibold">Phone</span>
          <input
            autoComplete="tel"
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            maxLength={40}
            name="phone"
            onChange={handleChange}
            type="tel"
            value={formData.phone}
          />
        </label>

        <label className="space-y-2">
          <span className="landing-form-label text-sm font-semibold">Event type</span>
          <select
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            name="eventType"
            onChange={handleChange}
            value={formData.eventType}
          >
            <option value="">Select an option</option>
            {eventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>{eventType}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="landing-form-label text-sm font-semibold">Expected event volume</span>
          <select
            className="landing-form-control min-h-12 w-full rounded-xl px-4 text-sm"
            name="eventVolume"
            onChange={handleChange}
            value={formData.eventVolume}
          >
            <option value="">Select an option</option>
            {eventVolumes.map((eventVolume) => (
              <option key={eventVolume} value={eventVolume}>{eventVolume}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 sm:col-span-2">
          <span className="landing-form-label text-sm font-semibold">What do you want to run with BracketIQ?</span>
          <textarea
            className="landing-form-control min-h-36 w-full rounded-xl px-4 py-3 text-sm"
            maxLength={2000}
            name="message"
            onChange={handleChange}
            value={formData.message}
          />
        </label>
      </div>

      {successMessage ? (
        <p className="landing-success mt-5 rounded-xl px-4 py-3 text-sm" role="status">
          {successMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="landing-error mt-5 rounded-xl px-4 py-3 text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button
        className="landing-btn-primary mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Sending request...' : 'Send demo request'}
      </button>
    </form>
  );
}
