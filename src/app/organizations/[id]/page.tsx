"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { Checkbox, Container, Group, Title, Text, Button, Paper, SegmentedControl, SimpleGrid, Stack, TextInput, Select, NumberInput, Modal, Textarea, Switch } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import EventCard from '@/components/ui/EventCard';
import TeamCard from '@/components/ui/TeamCard';
import UserCard from '@/components/ui/UserCard';
import { useApp } from '@/app/providers';
import type { Organization, Product, UserData, PaymentIntent, TemplateDocument } from '@/types';
import { formatPrice } from '@/types';
import { organizationService } from '@/lib/organizationService';
import { createId } from '@/lib/id';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import CreateTeamModal from '@/components/ui/CreateTeamModal';
import CreateOrganizationModal from '@/components/ui/CreateOrganizationModal';
import RefundRequestsList from '@/components/ui/RefundRequestsList';
import { paymentService } from '@/lib/paymentService';
import { userService } from '@/lib/userService';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { productService } from '@/lib/productService';
import { boldsignService } from '@/lib/boldsignService';
import PaymentModal from '@/components/ui/PaymentModal';
import FieldsTabContent from './FieldsTabContent';

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={<Loading fullScreen text="Loading organization..." />}>
      <OrganizationDetailContent />
    </Suspense>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeTemplateType = (value: unknown): TemplateDocument['type'] => {
  if (typeof value === 'string' && value.toUpperCase() === 'TEXT') {
    return 'TEXT';
  }
  return 'PDF';
};

const mapTemplateRow = (row: Record<string, any>): TemplateDocument => {
  const roleIndexRaw = row?.roleIndex;
  const roleIndex = typeof roleIndexRaw === 'number' ? roleIndexRaw : Number(roleIndexRaw);
  const roleIndexesRaw = Array.isArray(row?.roleIndexes) ? row.roleIndexes : undefined;
  const roleIndexes = roleIndexesRaw
    ? roleIndexesRaw
        .map((entry: unknown) => Number(entry))
        .filter((value: number) => Number.isFinite(value))
    : undefined;
  const signerRolesRaw = Array.isArray(row?.signerRoles) ? row.signerRoles : undefined;
  const signerRoles = signerRolesRaw
    ? signerRolesRaw
        .filter((entry: unknown): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
        .map((entry: string) => entry.trim())
    : undefined;
  const signOnceRaw = row?.signOnce;

  return {
    $id: String(row?.$id ?? ''),
    templateId: row?.templateId ?? undefined,
    organizationId: row?.organizationId ?? '',
    title: row?.title ?? 'Untitled Template',
    description: row?.description ?? undefined,
    signOnce: typeof signOnceRaw === 'boolean' ? signOnceRaw : signOnceRaw == null ? true : Boolean(signOnceRaw),
    status: row?.status ?? undefined,
    roleIndex: Number.isFinite(roleIndex) ? roleIndex : undefined,
    roleIndexes: roleIndexes && roleIndexes.length ? roleIndexes : undefined,
    signerRoles: signerRoles && signerRoles.length ? signerRoles : undefined,
    type: normalizeTemplateType(row?.type),
    content: row?.content ?? undefined,
    $createdAt: row?.$createdAt ?? undefined,
  };
};

function OrganizationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, authUser, loading: authLoading, isAuthenticated } = useApp();
  const [org, setOrg] = useState<Organization | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'teams' | 'fields' | 'referees' | 'refunds' | 'store' | 'templates'>('overview');
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showEditOrganizationModal, setShowEditOrganizationModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventDetailSheet, setShowEventDetailSheet] = useState(false);
  const [calendarView, setCalendarView] = useState<View>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [refereeSearch, setRefereeSearch] = useState('');
  const [refereeResults, setRefereeResults] = useState<UserData[]>([]);
  const [refereeSearchLoading, setRefereeSearchLoading] = useState(false);
  const [refereeError, setRefereeError] = useState<string | null>(null);
  const [refereeInvites, setRefereeInvites] = useState<{ firstName: string; lastName: string; email: string }[]>([
    { firstName: '', lastName: '', email: '' },
  ]);
  const [refereeInviteError, setRefereeInviteError] = useState<string | null>(null);
  const [invitingReferees, setInvitingReferees] = useState(false);
  const organizationHasStripeAccount = Boolean(org?.hasStripeAccount);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [managingStripe, setManagingStripe] = useState(false);
  const [stripeEmail, setStripeEmail] = useState('');
  const [stripeEmailError, setStripeEmailError] = useState<string | null>(null);
  const isOwner = Boolean(user && org && user.$id === org.ownerId);
  const availableTabs = useMemo(
    () => {
      const base: { label: string; value: typeof activeTab }[] = [
        { label: 'Overview', value: 'overview' },
        { label: 'Events', value: 'events' },
        { label: 'Teams', value: 'teams' },
      ];
      if (isOwner) {
        base.push({ label: 'Templates', value: 'templates' });
        base.push({ label: 'Referees', value: 'referees' });
        base.push({ label: 'Refunds', value: 'refunds' });
      }
      base.push({ label: 'Fields', value: 'fields' });
      base.push({ label: 'Store', value: 'store' });
      return base;
    },
    [isOwner],
  );
  const stripeEmailValid = useMemo(
    () => Boolean(stripeEmail && EMAIL_REGEX.test(stripeEmail.trim())),
    [stripeEmail],
  );

  const localizer = useMemo(() => dateFnsLocalizer({
    format,
    parse: parse as any,
    startOfWeek,
    getDay,
    locales: {} as any,
  }), []);

  const id = Array.isArray(params?.id) ? params?.id[0] : (params?.id as string);

  // Custom event renderer to show start/end times on cards
  const CalendarEvent: any = ({ event }: any) => {
    const s: Date = event.start instanceof Date ? event.start : new Date(event.start);
    const e: Date = event.end instanceof Date ? event.end : new Date(event.end);
    const title = event.resource?.name || event.title;
    return (
      <div className="leading-tight">
        <div className="truncate">{title}</div>
      </div>
    );
  };

  const currentRefereeIds = useMemo(
    () => (Array.isArray(org?.refIds) ? org.refIds.filter((id): id is string => typeof id === 'string') : []),
    [org?.refIds],
  );

  const currentReferees = useMemo(() => org?.referees ?? [], [org?.referees]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productPeriod, setProductPeriod] = useState<'month' | 'week' | 'year'>('month');
  const [productPrice, setProductPrice] = useState<number | ''>(10);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null);
  const [purchasePaymentData, setPurchasePaymentData] = useState<PaymentIntent | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductDescription, setEditProductDescription] = useState('');
  const [editProductPeriod, setEditProductPeriod] = useState<'month' | 'week' | 'year'>('month');
  const [editProductPrice, setEditProductPrice] = useState<number | ''>(0);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [templateDocuments, setTemplateDocuments] = useState<TemplateDocument[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateType, setTemplateType] = useState<'PDF' | 'TEXT'>('PDF');
  const [templateContent, setTemplateContent] = useState('');
  const [templateSignOnce, setTemplateSignOnce] = useState(true);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [templateEmbedUrl, setTemplateEmbedUrl] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDocument | null>(null);
  const [previewMode, setPreviewMode] = useState<'read' | 'sign'>('read');
  const [previewAccepted, setPreviewAccepted] = useState(false);
  const [previewSignComplete, setPreviewSignComplete] = useState(false);

  const openTemplatePreview = useCallback((template: TemplateDocument) => {
    setPreviewTemplate(template);
    setPreviewMode(template.type === 'TEXT' ? 'sign' : 'read');
    setPreviewAccepted(false);
    setPreviewSignComplete(false);
  }, []);

  const loadOrg = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await organizationService.getOrganizationById(orgId, true);
      if (data) setOrg(data);
    } catch (e) {
      console.error('Failed to load organization', e);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadTemplates = useCallback(async (orgId: string, options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setTemplatesLoading(true);
    }
    try {
      if (!user?.$id) {
        return;
      }
      const response = await fetch(`/api/organizations/${orgId}/templates`, {
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load templates');
      }
      const rows = Array.isArray(payload?.templates) ? payload.templates : [];
      setTemplateDocuments(rows.map((row: any) => mapTemplateRow(row)));
      if (!silent) {
        setTemplatesError(null);
      }
    } catch (error) {
      console.error('Failed to load templates', error);
      setTemplateDocuments([]);
      setTemplatesError(error instanceof Error ? error.message : 'Failed to load templates.');
    } finally {
      if (!silent) {
        setTemplatesLoading(false);
      }
    }
  }, [user?.$id]);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }
      if (id) loadOrg(id);
    }
  }, [authLoading, isAuthenticated, user, router, id, loadOrg]);

  useEffect(() => {
    if (!org || !user) return;
    if (stripeEmail) return;
    const fallbackEmail = (org as any)?.email || authUser?.email || '';
    if (fallbackEmail) {
      setStripeEmail(fallbackEmail);
    }
  }, [org, user, authUser, stripeEmail]);

  useEffect(() => {
    if (org?.products) {
      setProducts(org.products);
    }
  }, [org?.products]);

  useEffect(() => {
    if (!org || !isOwner || !user) {
      setTemplateDocuments([]);
      return;
    }
    loadTemplates(org.$id);
  }, [org, isOwner, user, loadTemplates]);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.value === activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0].value);
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    const tabParam = searchParams?.get('tab');
    if (tabParam && availableTabs.some((tab) => tab.value === tabParam)) {
      setActiveTab(tabParam as typeof activeTab);
    }
  }, [availableTabs, searchParams]);

  const handleCreateEvent = useCallback(() => {
    const newId = createId();
    const params = new URLSearchParams({
      create: '1',
      mode: 'edit',
      tab: 'details',
      orgId: id ?? '',
    });
    router.push(`/events/${newId}/schedule?${params.toString()}`);
  }, [id, router]);

  const handleCreateTemplate = useCallback(async () => {
    if (!org || !user) return;
    const trimmedTitle = templateTitle.trim();
    if (!trimmedTitle) {
      setTemplatesError('Template title is required.');
      return;
    }
    const trimmedContent = templateContent.trim();
    if (templateType === 'TEXT' && !trimmedContent) {
      setTemplatesError('Template text is required.');
      return;
    }
    try {
      setCreatingTemplate(true);
      setTemplatesError(null);
      const result = await boldsignService.createTemplate({
        organizationId: org.$id,
        userId: user.$id,
        title: trimmedTitle,
        description: templateDescription.trim() || undefined,
        signOnce: templateSignOnce,
        type: templateType,
        content: templateType === 'TEXT' ? trimmedContent : undefined,
      });
      setTemplateEmbedUrl(result.createUrl ?? null);
      setTemplateModalOpen(false);
      setTemplateTitle('');
      setTemplateDescription('');
      setTemplateType('PDF');
      setTemplateContent('');
      setTemplateSignOnce(true);
      await loadTemplates(org.$id, { silent: true });
    } catch (error) {
      setTemplatesError(
        error instanceof Error ? error.message : 'Failed to create template.',
      );
    } finally {
      setCreatingTemplate(false);
    }
  }, [org, user, templateTitle, templateDescription, templateSignOnce, templateType, templateContent, loadTemplates]);

  const handleConnectStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    const trimmedEmail = stripeEmail.trim();
    const isValidEmail = EMAIL_REGEX.test(trimmedEmail);
    if (!isValidEmail) {
      setStripeEmailError('Enter a valid email to start Stripe onboarding.');
      return;
    }
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe onboarding is only available in the browser.' });
      return;
    }
    try {
      setStripeEmailError(null);
      setConnectingStripe(true);
      const origin = window.location.origin;
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.connectStripeAccount({
        organization: org,
        organizationEmail: trimmedEmail,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe onboarding did not return a link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to connect Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to start Stripe onboarding right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setConnectingStripe(false);
    }
  }, [org, isOwner, stripeEmail]);

  const handleManageStripeAccount = useCallback(async () => {
    if (!org || !isOwner) return;
    if (typeof window === 'undefined') {
      notifications.show({ color: 'red', message: 'Stripe management is only available in the browser.' });
      return;
    }
    try {
      setManagingStripe(true);
      const origin = window.location.origin;
      const basePath = `/organizations/${org.$id}`;
      const refreshUrl = `${origin}${basePath}?stripe=refresh`;
      const returnUrl = `${origin}${basePath}?stripe=return`;
      const result = await paymentService.manageStripeAccount({
        organization: org,
        refreshUrl,
        returnUrl,
      });
      if (result?.onboardingUrl) {
        window.open(result.onboardingUrl, '_blank', 'noopener,noreferrer');
      } else {
        notifications.show({ color: 'red', message: 'Stripe did not return a management link. Try again later.' });
      }
    } catch (error) {
      console.error('Failed to manage Stripe account', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Unable to open Stripe management right now.';
      notifications.show({ color: 'red', message });
    } finally {
      setManagingStripe(false);
    }
  }, [org, isOwner]);

  const refreshOrganizationProducts = useCallback(
    async (orgId: string) => {
      await loadOrg(orgId, { silent: true });
      const latest = await organizationService.getOrganizationById(orgId, true);
      if (latest) {
        setOrg(latest);
        setProducts(latest.products ?? []);
      }
    },
    [loadOrg],
  );

  const handleCreateProduct = useCallback(async () => {
    if (!org || !user || !isOwner) return;
    const priceNumber = typeof productPrice === 'number' ? productPrice : Number(productPrice);
    const priceCents = Math.round((Number.isFinite(priceNumber) ? priceNumber : 0) * 100);
    if (!productName.trim()) {
      notifications.show({ color: 'red', message: 'Product name is required.' });
      return;
    }
    if (!priceCents || priceCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a valid price greater than zero.' });
      return;
    }
    try {
      setCreatingProduct(true);
      const created = await productService.createProduct({
        user,
        organizationId: org.$id,
        name: productName.trim(),
        description: productDescription.trim() || undefined,
        priceCents,
        period: productPeriod,
      });
      notifications.show({ color: 'green', message: `Created product "${created.name}".` });
      setProductName('');
      setProductDescription('');
      setProductPrice(10);
      setProductPeriod('month');
      await refreshOrganizationProducts(org.$id);
    } catch (error) {
      console.error('Failed to create product', error);
      notifications.show({ color: 'red', message: 'Failed to create product. Try again.' });
    } finally {
      setCreatingProduct(false);
    }
  }, [isOwner, org, productDescription, productName, productPeriod, productPrice, refreshOrganizationProducts, user]);

  const openProductModal = useCallback((product: Product) => {
    setSelectedProduct(product);
    setEditProductName(product.name);
    setEditProductDescription(product.description ?? '');
    const normalizedPeriod = (product.period === 'month' ? 'month' : product.period) as 'month' | 'week' | 'year';
    setEditProductPeriod(normalizedPeriod ?? 'month');
    const priceDollars = (typeof product.priceCents === 'number' ? product.priceCents : Number(product.priceCents) || 0) / 100;
    setEditProductPrice(Number.isFinite(priceDollars) ? priceDollars : 0);
    setProductModalOpen(true);
  }, []);

  const closeProductModal = useCallback(() => {
    setProductModalOpen(false);
    setSelectedProduct(null);
    setEditProductName('');
    setEditProductDescription('');
    setEditProductPeriod('month');
    setEditProductPrice(0);
  }, []);

  const handleUpdateProduct = useCallback(async () => {
    if (!org || !selectedProduct || !isOwner) return;
    const priceNumber = typeof editProductPrice === 'number' ? editProductPrice : Number(editProductPrice);
    const priceCents = Math.round((Number.isFinite(priceNumber) ? priceNumber : 0) * 100);
    if (!editProductName.trim()) {
      notifications.show({ color: 'red', message: 'Product name is required.' });
      return;
    }
    if (!priceCents || priceCents <= 0) {
      notifications.show({ color: 'red', message: 'Enter a valid price greater than zero.' });
      return;
    }
    try {
      setUpdatingProduct(true);
      await productService.updateProduct(selectedProduct.$id, {
        name: editProductName.trim(),
        description: editProductDescription.trim() || undefined,
        priceCents,
        period: editProductPeriod,
      });
      notifications.show({ color: 'green', message: 'Product updated.' });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to update product', error);
      notifications.show({ color: 'red', message: 'Failed to update product. Try again.' });
    } finally {
      setUpdatingProduct(false);
    }
  }, [closeProductModal, editProductDescription, editProductName, editProductPeriod, editProductPrice, isOwner, org, refreshOrganizationProducts, selectedProduct]);

  const handleDeleteProduct = useCallback(async () => {
    if (!org || !selectedProduct || !isOwner) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete product "${selectedProduct.name}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }
    try {
      setDeletingProduct(true);
      await productService.deleteProduct(selectedProduct.$id);
      notifications.show({ color: 'green', message: 'Product deleted.' });
      await refreshOrganizationProducts(org.$id);
      closeProductModal();
    } catch (error) {
      console.error('Failed to delete product', error);
      notifications.show({ color: 'red', message: 'Failed to delete product. Try again.' });
    } finally {
      setDeletingProduct(false);
    }
  }, [closeProductModal, isOwner, org, refreshOrganizationProducts, selectedProduct]);

  const handlePurchaseProduct = useCallback(
    async (product: Product) => {
      if (!org || !user) {
        notifications.show({ color: 'red', message: 'You must be signed in to purchase.' });
        return;
      }
      try {
        setPurchaseProduct(product);
        setPurchasePaymentData(null);
        const intent = await paymentService.createProductPaymentIntent(user, product, org);
        setPurchasePaymentData(intent);
        setShowPurchaseModal(true);
      } catch (error) {
        console.error('Failed to start purchase', error);
        notifications.show({ color: 'red', message: 'Unable to start checkout. Please try again.' });
      }
    },
    [org, user],
  );

  const handleProductPaymentSuccess = useCallback(async () => {
    if (!purchaseProduct || !user) return;
    try {
      setSubscribing(true);
      await productService.createSubscription({
        productId: purchaseProduct.$id,
        user,
        organizationId: org?.$id,
        priceCents: purchaseProduct.priceCents,
        startDate: new Date().toISOString(),
      });
      notifications.show({ color: 'green', message: `Subscription started for ${purchaseProduct.name}.` });
      if (org?.$id) {
        await refreshOrganizationProducts(org.$id);
      }
    } catch (error) {
      console.error('Failed to record subscription', error);
      notifications.show({ color: 'red', message: 'Payment succeeded but subscription failed. Contact support.' });
    } finally {
      setSubscribing(false);
      setShowPurchaseModal(false);
      setPurchasePaymentData(null);
      setPurchaseProduct(null);
    }
  }, [org?.$id, purchaseProduct, refreshOrganizationProducts, user]);

  const handleSearchReferees = useCallback(
    async (query: string) => {
      setRefereeSearch(query);
      setRefereeError(null);
      if (query.trim().length < 2) {
        setRefereeResults([]);
        return;
      }
      try {
        setRefereeSearchLoading(true);
        const results = await userService.searchUsers(query.trim());
        const filtered = results.filter((candidate) => !currentRefereeIds.includes(candidate.$id));
        setRefereeResults(filtered);
      } catch (error) {
        console.error('Failed to search referees:', error);
        setRefereeError('Failed to search referees. Try again.');
      } finally {
        setRefereeSearchLoading(false);
      }
    },
    [currentRefereeIds],
  );

  const handleAddReferee = useCallback(
    async (referee: UserData) => {
      if (!org || !isOwner) return;
      const nextRefIds = Array.from(new Set([...(org.refIds ?? []), referee.$id]));
      try {
        await organizationService.updateOrganization(org.$id, { refIds: nextRefIds });
        setOrg((prev) => {
          if (!prev) return prev;
          const existingRefs = prev.referees ?? [];
          const nextRefs = existingRefs.some((r) => r.$id === referee.$id) ? existingRefs : [...existingRefs, referee];
          return { ...prev, refIds: nextRefIds, referees: nextRefs };
        });
        setRefereeResults((prev) => prev.filter((candidate) => candidate.$id !== referee.$id));
        notifications.show({
          color: 'green',
          message: `${referee.firstName || referee.userName || 'Referee'} added to roster.`,
        });
      } catch (error) {
        console.error('Failed to add referee:', error);
        notifications.show({ color: 'red', message: 'Failed to add referee.' });
      }
    },
    [org, isOwner],
  );

  const handleInviteRefereeEmails = useCallback(async () => {
    if (!org || !isOwner || !user) return;

    const sanitized = refereeInvites.map((invite) => ({
      firstName: invite.firstName.trim(),
      lastName: invite.lastName.trim(),
      email: invite.email.trim(),
    }));

    for (const invite of sanitized) {
      if (!invite.firstName || !invite.lastName || !EMAIL_REGEX.test(invite.email)) {
        setRefereeInviteError('Enter first, last, and valid email for all invites.');
        return;
      }
    }

    setRefereeInviteError(null);
    setInvitingReferees(true);
    try {
      await userService.inviteUsersByEmail(
        user.$id,
        sanitized.map((invite) => ({
          ...invite,
          type: 'referee' as const,
          organizationId: org.$id,
        })),
      );
      await loadOrg(org.$id, { silent: true });
      notifications.show({
        color: 'green',
        message: 'Referee invites sent. New referees will be added automatically.',
      });
      setRefereeInvites([{ firstName: '', lastName: '', email: '' }]);
    } catch (error) {
      setRefereeInviteError(error instanceof Error ? error.message : 'Failed to invite referees.');
    } finally {
      setInvitingReferees(false);
    }
  }, [org, isOwner, user, refereeInvites]);

  const handleRemoveReferee = useCallback(
    async (refereeId: string) => {
      if (!org || !isOwner) return;
      const nextRefIds = (org.refIds ?? []).filter((id) => id !== refereeId);
      try {
        await organizationService.updateOrganization(org.$id, { refIds: nextRefIds });
        setOrg((prev) => {
          if (!prev) return prev;
          const nextRefs = (prev.referees ?? []).filter((ref) => ref.$id !== refereeId);
          return { ...prev, refIds: nextRefIds, referees: nextRefs };
        });
      } catch (error) {
        console.error('Failed to remove referee:', error);
        notifications.show({ color: 'red', message: 'Failed to remove referee.' });
      }
    },
    [org, isOwner],
  );

  if (authLoading) return <Loading fullScreen text="Loading organization..." />;
  if (!isAuthenticated || !user) return null;

  const logoUrl = org?.logoId
    ? `/api/files/${org.logoId}/preview?w=64&h=64&fit=cover`
    : org?.name
      ? `/api/avatars/initials?name=${encodeURIComponent(org.name)}&size=64`
      : '';

  return (
    <>
      <Navigation />
      <Container size="lg" py="xl">
        {loading || !org ? (
          <Loading fullScreen={false} text="Loading organization..." />
        ) : (
          <>
            {/* Header */}
            <Group justify="space-between" align="center" mb="lg">
              <Group gap="md">
                {logoUrl && <img src={logoUrl} alt={org.name} style={{ width: 64, height: 64, borderRadius: '9999px', border: '1px solid #e5e7eb' }} />}
                <div>
                  <Title order={2} mb={2}>{org.name}</Title>
                  <Group gap="md">
                    {org.website && (
                      <a href={org.website} target="_blank" rel="noreferrer"><Text c="blue">{org.website}</Text></a>
                    )}
                    {org.location && (
                      <Text size="sm" c="dimmed">{org.location}</Text>
                    )}
                  </Group>
                </div>
              </Group>
            </Group>

            {/* Tabs */}
            <SegmentedControl
              value={activeTab}
              onChange={(v: any) => setActiveTab(v)}
              data={availableTabs}
              mb="lg"
            />

            {activeTab === 'overview' && (
              <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
                <div style={{ gridColumn: 'span 2' }}>
                  <Paper withBorder p="md" radius="md" mb="md">
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Title order={5}>About</Title>
                      {isOwner && (
                        <Button variant="light" size="xs" onClick={() => setShowEditOrganizationModal(true)}>
                          Edit Organization
                        </Button>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{org.description || 'No description'}</Text>
                  </Paper>
                  <Paper withBorder p="md" radius="md">
                    <Title order={5} mb="md">Recent Events</Title>
                    {org.events && org.events.length > 0 ? (
                      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {org.events.slice(0, 4).map((e) => (
                          <EventCard
                            key={e.$id}
                            event={e}
                            onClick={() => { setSelectedEvent(e); setShowEventDetailSheet(true); }}
                          />
                        ))}
                      </SimpleGrid>
                    ) : (
                      <Text size="sm" c="dimmed">No events yet.</Text>
                    )}
                  </Paper>
                </div>
                <div>
                  {isOwner && (
                    <Paper withBorder p="md" radius="md" mb="md">
                      <Title order={5} mb="sm">Payments</Title>
                      <Text size="sm" c="dimmed" mb="sm">
                        {organizationHasStripeAccount
                          ? 'Stripe is connected. Manage your payout details when needed.'
                          : 'Connect a Stripe account to accept payments for rentals.'}
                      </Text>
                      <Stack gap="xs">
                        {!organizationHasStripeAccount && (
                          <TextInput
                            label="Stripe payout email"
                            type="email"
                            placeholder="billing@example.com"
                            value={stripeEmail}
                            error={stripeEmailError ?? undefined}
                            onChange={(e) => {
                              const next = e.currentTarget.value;
                              setStripeEmail(next);
                              if (stripeEmailError && EMAIL_REGEX.test(next.trim())) {
                                setStripeEmailError(null);
                              }
                            }}
                            disabled={connectingStripe}
                            required
                          />
                        )}
                        <Button
                          size="sm"
                          loading={organizationHasStripeAccount ? managingStripe : connectingStripe}
                          disabled={!organizationHasStripeAccount && !stripeEmailValid}
                          onClick={organizationHasStripeAccount ? handleManageStripeAccount : handleConnectStripeAccount}
                        >
                          {organizationHasStripeAccount ? 'Manage Stripe Account' : 'Connect Stripe Account'}
                        </Button>
                        {!organizationHasStripeAccount && (
                          <Text size="xs" c="dimmed">
                            Completing onboarding enables paid rentals for this organization.
                          </Text>
                        )}
                      </Stack>
                    </Paper>
                  )}
                  <Paper withBorder p="md" radius="md">
                    <Title order={5} mb="md">Teams</Title>
                    {org.teams && org.teams.length > 0 ? (
                      <div className="space-y-3">
                        {org.teams.slice(0, 3).map((t) => (
                          <TeamCard key={t.$id} team={t} showStats={false} />
                        ))}
                      </div>
                    ) : (
                      <Text size="sm" c="dimmed">No teams yet.</Text>
                    )}
                  </Paper>
                  {isOwner && (
                    <Paper withBorder p="md" radius="md" mt="md">
                      <Title order={5} mb="md">Referees</Title>
                      {currentReferees.length > 0 ? (
                        <div className="space-y-3">
                          {currentReferees.slice(0, 4).map((ref) => (
                            <UserCard key={ref.$id} user={ref} className="!p-0 !shadow-none" />
                          ))}
                        </div>
                      ) : (
                        <Text size="sm" c="dimmed">No referees yet.</Text>
                      )}
                    </Paper>
                  )}
                </div>
              </SimpleGrid>
            )}

            {activeTab === 'events' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="sm">
                  <Title order={5}>Events Calendar</Title>
                  {isOwner && <Button onClick={handleCreateEvent}>+ Create Event</Button>}
                </Group>
                <div className="h-[800px]">
                  <BigCalendar
                    localizer={localizer}
                    events={(org.events || []).map(e => ({
                      title: e.name,
                      start: new Date(e.start),
                      end: new Date(e.end),
                      resource: e,
                    }))}
                    startAccessor="start"
                    endAccessor="end"
                    views={["month", "week", "day", "agenda"]}
                    view={calendarView}
                    date={calendarDate}
                    onView={(view) => setCalendarView(view)}
                    onNavigate={(date) => setCalendarDate(new Date(date))}
                    step={30}
                    popup
                    selectable
                    components={{ event: CalendarEvent, month: { event: CalendarEvent } as any }}
                    onSelectEvent={(evt: any) => { setSelectedEvent(evt.resource); setShowEventDetailSheet(true); }}
                    onSelectSlot={handleCreateEvent}
                  />
                </div>
              </Paper>
            )}

            {activeTab === 'teams' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Teams</Title>
                  {isOwner && <Button onClick={() => setShowCreateTeamModal(true)}>Create Team</Button>}
                </Group>
                {org.teams && org.teams.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                    {org.teams.map((t) => (
                      <TeamCard key={t.$id} team={t} />
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No teams yet.</Text>
                )}
              </Paper>
            )}

            {isOwner && activeTab === 'templates' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Templates</Title>
                  <Group>
                    <Button
                      variant="default"
                      onClick={() => org && loadTemplates(org.$id)}
                      loading={templatesLoading}
                    >
                      Refresh
                    </Button>
                    <Button onClick={() => setTemplateModalOpen(true)}>
                      Create Template
                    </Button>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed" mb="md">
                  Create reusable documents for participants to sign during event registration.
                </Text>
                {templatesError && (
                  <Text size="sm" c="red" mb="md">
                    {templatesError}
                  </Text>
                )}

                {templateEmbedUrl && (
                  <Paper withBorder p="md" radius="md" mb="md">
                    <Text size="sm" c="dimmed" mb="xs">
                      Embedded Template Builder
                    </Text>
                    <div style={{ height: 620 }}>
                      <iframe
                        src={templateEmbedUrl}
                        title="BoldSign Template Builder"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                      />
                    </div>
                  </Paper>
                )}

                {templatesLoading ? (
                  <Text size="sm" c="dimmed">Loading templates...</Text>
                ) : templateDocuments.length > 0 ? (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
                    {templateDocuments.map((template) => (
                      <Paper key={template.$id} withBorder p="sm" radius="md">
                        <Text fw={600}>{template.title || 'Untitled Template'}</Text>
                        <Text size="sm" c="dimmed">
                          {template.signOnce ? 'Sign once per participant' : 'Sign for every event'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Type: {template.type ?? 'PDF'}
                        </Text>
                        {template.status && (
                          <Text size="xs" c="dimmed">
                            Status: {template.status}
                          </Text>
                        )}
                        {template.type === 'TEXT' && (
                          <Group justify="flex-end" mt="sm">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => openTemplatePreview(template)}
                            >
                              Preview
                            </Button>
                          </Group>
                        )}
                      </Paper>
                    ))}
                  </SimpleGrid>
                ) : (
                  <Text size="sm" c="dimmed">No templates yet.</Text>
                )}
              </Paper>
            )}

            {isOwner && activeTab === 'referees' && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" mb="md">
                  <Title order={5}>Referees</Title>
                  {isOwner && <Text size="sm" c="dimmed">Manage your referee roster</Text>}
                </Group>

                <Stack gap="md">
                  <div>
                    <Title order={6} mb="sm">Current Referees</Title>
                    {currentReferees.length > 0 ? (
                      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                        {currentReferees.map((ref) => (
                          <Paper key={ref.$id} withBorder p="sm" radius="md">
                            <Group justify="space-between" align="center" gap="sm">
                              <UserCard user={ref} className="!p-0 !shadow-none flex-1" />
                              {isOwner && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => handleRemoveReferee(ref.$id)}
                                >
                                  Remove
                                </Button>
                              )}
                            </Group>
                          </Paper>
                        ))}
                      </SimpleGrid>
                    ) : (
                      <Text size="sm" c="dimmed">No referees yet.</Text>
                    )}
                  </div>

                  {isOwner && (
                    <Paper withBorder p="md" radius="md">
                      <Title order={6} mb="xs">Add Referees</Title>
                      <TextInput
                        value={refereeSearch}
                        onChange={(e) => handleSearchReferees(e.currentTarget.value)}
                        placeholder="Search referees by name or username"
                        mb="xs"
                      />
                      {refereeError && (
                        <Text size="xs" c="red" mb="xs">
                          {refereeError}
                        </Text>
                      )}
                      {refereeSearchLoading ? (
                        <Text size="sm" c="dimmed">Searching referees...</Text>
                      ) : refereeSearch.length < 2 ? (
                        <Text size="sm" c="dimmed">Type at least 2 characters to search for referees.</Text>
                      ) : refereeResults.length > 0 ? (
                        <Stack gap="xs">
                          {refereeResults.map((result) => (
                            <Paper key={result.$id} withBorder p="sm" radius="md">
                              <Group justify="space-between" align="center" gap="sm">
                                <UserCard user={result} className="!p-0 !shadow-none flex-1" />
                                <Button size="xs" onClick={() => handleAddReferee(result)}>
                                  Add
                                </Button>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>
                      ) : (
                        <Stack gap="xs">
                          <Text size="sm" c="dimmed">No referees found. Invite by email below.</Text>
                        </Stack>
                      )}
                      <div className="mt-6">
                        <Title order={6} mb="xs">Invite referees by email</Title>
                        <Text size="sm" c="dimmed" mb="xs">
                          Add referees to this organization and send them an email invite.
                        </Text>
                        <div className="space-y-3">
                          {refereeInvites.map((invite, index) => (
                            <Paper key={index} withBorder radius="md" p="sm">
                              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                                <TextInput
                                  label="First name"
                                  placeholder="First name"
                                  value={invite.firstName}
                                  onChange={(e) => {
                                    const next = [...refereeInvites];
                                    next[index] = { ...invite, firstName: e.currentTarget.value };
                                    setRefereeInvites(next);
                                  }}
                                />
                                <TextInput
                                  label="Last name"
                                  placeholder="Last name"
                                  value={invite.lastName}
                                  onChange={(e) => {
                                    const next = [...refereeInvites];
                                    next[index] = { ...invite, lastName: e.currentTarget.value };
                                    setRefereeInvites(next);
                                  }}
                                />
                                <TextInput
                                  label="Email"
                                  placeholder="name@example.com"
                                  value={invite.email}
                                  onChange={(e) => {
                                    const next = [...refereeInvites];
                                    next[index] = { ...invite, email: e.currentTarget.value };
                                    setRefereeInvites(next);
                                  }}
                                />
                              </SimpleGrid>
                              {refereeInvites.length > 1 && (
                                <Group justify="flex-end" mt="xs">
                                  <Button
                                    variant="subtle"
                                    color="red"
                                    size="xs"
                                    onClick={() => {
                                      setRefereeInvites((prev) => prev.filter((_, i) => i !== index));
                                    }}
                                  >
                                    Remove
                                  </Button>
                                </Group>
                              )}
                            </Paper>
                          ))}
                          <Group justify="space-between" align="center">
                            <Button
                              type="button"
                              variant="default"
                              size="lg"
                              radius="md"
                              style={{ width: 64, height: 64, fontSize: 28, padding: 0 }}
                              onClick={() =>
                                setRefereeInvites((prev) => [...prev, { firstName: '', lastName: '', email: '' }])
                              }
                            >
                              +
                            </Button>
                            <Button
                              onClick={handleInviteRefereeEmails}
                              loading={invitingReferees}
                              disabled={invitingReferees}
                            >
                              Add Referees
                            </Button>
                          </Group>
                          {refereeInviteError && (
                            <Text size="xs" c="red">
                              {refereeInviteError}
                            </Text>
                          )}
                        </div>
                      </div>
                    </Paper>
                  )}
                </Stack>
              </Paper>
            )}

            {isOwner && activeTab === 'refunds' && org && (
              <RefundRequestsList organizationId={org.$id} />
            )}

            {activeTab === 'store' && org && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" align="center" mb="md">
                  <Title order={5}>Store</Title>
                  {!organizationHasStripeAccount && (
                    <Text size="sm" c="red">
                      Connect Stripe to accept payments for products.
                    </Text>
                  )}
                </Group>

                {isOwner && (
                  <Paper withBorder radius="md" p="md" mb="lg">
                    <Title order={6} mb="xs">Add membership product</Title>
                    <Text size="sm" c="dimmed" mb="md">
                      Create a recurring membership product that users can purchase.
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <TextInput
                        label="Name"
                        placeholder="Membership"
                        value={productName}
                        onChange={(e) => setProductName(e.currentTarget.value)}
                        required
                      />
                      <NumberInput
                        label="Price (USD)"
                        min={0}
                        decimalScale={2}
                        hideControls
                        value={productPrice}
                        onChange={(value) => setProductPrice(value === '' ? '' : Number(value))}
                        leftSection="$"
                      />
                      <Select
                        label="Billing period"
                        data={[
                          { label: 'Month', value: 'month' },
                          { label: 'Week', value: 'week' },
                          { label: 'Year', value: 'year' },
                        ]}
                        value={productPeriod}
                        onChange={(value) => setProductPeriod((value as any) ?? 'month')}
                      />
                      <TextInput
                        label="Description"
                        placeholder="Optional description"
                        value={productDescription}
                        onChange={(e) => setProductDescription(e.currentTarget.value)}
                      />
                    </SimpleGrid>
                    <Group justify="flex-end" mt="md">
                      <Button onClick={handleCreateProduct} loading={creatingProduct} disabled={!organizationHasStripeAccount}>
                        Add Product
                      </Button>
                    </Group>
                  </Paper>
                )}

                <Title order={6} mb="sm">Products</Title>
                {products.length === 0 ? (
                  <Text size="sm" c="dimmed">No products yet.</Text>
                ) : (
                  <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                    {products.map((product) => (
                      <Paper
                        key={product.$id}
                        withBorder
                        radius="md"
                        p="md"
                        onClick={() => {
                          if (isOwner) {
                            openProductModal(product);
                          }
                        }}
                        style={{ cursor: isOwner ? 'pointer' : 'default' }}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div>
                            <Text fw={600}>{product.name}</Text>
                            {product.description && <Text size="sm" c="dimmed">{product.description}</Text>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <Text size="sm" c="dimmed" tt="capitalize">{product.period}</Text>
                            {isOwner && (
                              <Text size="xs" c="dimmed">Click card to edit</Text>
                            )}
                          </div>
                        </Group>
                        <Text fw={700} mb="xs">{formatPrice(product.priceCents)}</Text>
                        {product.isActive === false && (
                          <Text size="xs" c="red" mb="xs">Inactive</Text>
                        )}
                        <Button
                          fullWidth
                          variant={isOwner ? 'outline' : 'filled'}
                          disabled={product.isActive === false || (!organizationHasStripeAccount && !isOwner)}
                          onClick={(event) => {
                            if (isOwner) {
                              event.stopPropagation();
                            }
                            handlePurchaseProduct(product);
                          }}
                        >
                          {isOwner ? 'Preview Checkout' : 'Purchase'}
                        </Button>
                      </Paper>
                    ))}
                  </SimpleGrid>
                )}
              </Paper>
            )}

            {activeTab === 'fields' && org && (
              <FieldsTabContent organization={org} organizationId={id ?? ''} currentUser={user ?? null} />
            )}
          </>
        )}
      </Container>

      {/* Modals */}
      <EventDetailSheet
        event={selectedEvent!}
        isOpen={showEventDetailSheet}
        onClose={() => { setShowEventDetailSheet(false); }}
      />
      <CreateTeamModal
        isOpen={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        currentUser={user}
        onTeamCreated={async (team) => {
          setShowCreateTeamModal(false);
          if (!team) {
            if (id) await loadOrg(id);
            return;
          }

          const nextTeamIds = Array.from(new Set([...(org?.teamIds ?? []), team.$id]));

          setOrg((prev) => {
            if (!prev) return prev;
            return { ...prev, teamIds: nextTeamIds, teams: [...(prev.teams ?? []), team] };
          });

          if (id) {
            try {
              await organizationService.updateOrganization(id, { teamIds: nextTeamIds });
            } catch (e) {
              console.error('Failed to attach team to organization', e);
            }
            await loadOrg(id);
          }
        }}
      />
      <CreateOrganizationModal
        isOpen={showEditOrganizationModal}
        onClose={() => setShowEditOrganizationModal(false)}
        currentUser={user!}
        organization={org}
        onUpdated={async (updatedOrg) => {
          setOrg(updatedOrg);
          if (id) {
            await loadOrg(id);
          }
        }}
      />
      <Modal
        opened={Boolean(previewTemplate)}
        onClose={() => setPreviewTemplate(null)}
        centered
        size="lg"
        title={previewTemplate ? `Preview: ${previewTemplate.title || 'Untitled Template'}` : 'Preview template'}
      >
        {previewTemplate ? (
          <Stack gap="sm">
            <Group justify="space-between" align="center" gap="sm">
              <Stack gap={2} style={{ flex: 1 }}>
                <Text size="sm" c="dimmed">
                  Preview only. This will not record a signature.
                </Text>
                <Text size="xs" c="dimmed">
                  {previewTemplate.signOnce ? 'Sign once per participant' : 'Sign for every event'}
                </Text>
              </Stack>
              {previewTemplate.type === 'TEXT' && (
                <SegmentedControl
                  value={previewMode}
                  onChange={(value) => {
                    setPreviewMode(value as 'read' | 'sign');
                    setPreviewAccepted(false);
                    setPreviewSignComplete(false);
                  }}
                  data={[
                    { label: 'Signing', value: 'sign' },
                    { label: 'Read', value: 'read' },
                  ]}
                />
              )}
            </Group>

            {previewTemplate.type !== 'TEXT' || previewMode === 'read' ? (
              <Paper
                withBorder
                p="md"
                radius="md"
                style={{ maxHeight: '65vh', overflowY: 'auto' }}
              >
                <Text style={{ whiteSpace: 'pre-wrap' }}>
                  {previewTemplate.content || 'No waiver text provided.'}
                </Text>
              </Paper>
            ) : previewSignComplete ? (
              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Text fw={600}>Preview complete</Text>
                  <Text size="sm" c="dimmed">
                    In the real flow, we would now record the signature and continue to the next required document.
                  </Text>
                  <Group justify="flex-end" gap="xs">
                    <Button
                      variant="default"
                      onClick={() => {
                        setPreviewAccepted(false);
                        setPreviewSignComplete(false);
                      }}
                    >
                      Start over
                    </Button>
                    <Button onClick={() => setPreviewTemplate(null)}>
                      Close
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            ) : (
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  Document 1 of 1{previewTemplate.title ? ` • ${previewTemplate.title}` : ''}
                </Text>
                <Paper withBorder p="md" style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <Text style={{ whiteSpace: 'pre-wrap' }}>
                    {previewTemplate.content || 'No waiver text provided.'}
                  </Text>
                </Paper>
                <Checkbox
                  label="I agree to the waiver above."
                  checked={previewAccepted}
                  onChange={(event) => setPreviewAccepted(event.currentTarget.checked)}
                />
                <Group justify="flex-end">
                  <Button
                    onClick={() => setPreviewSignComplete(true)}
                    disabled={!previewAccepted}
                  >
                    Accept and continue
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        ) : null}
      </Modal>
      <Modal
        opened={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        title="Create template"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Template title"
            value={templateTitle}
            onChange={(e) => setTemplateTitle(e.currentTarget.value)}
            required
          />
          <SegmentedControl
            value={templateType}
            onChange={(value) => setTemplateType(value as 'PDF' | 'TEXT')}
            data={[
              { label: 'PDF (BoldSign)', value: 'PDF' },
              { label: 'Text waiver', value: 'TEXT' },
            ]}
          />
          <Textarea
            label="Description"
            value={templateDescription}
            onChange={(e) => setTemplateDescription(e.currentTarget.value)}
            minRows={3}
          />
          {templateType === 'TEXT' && (
            <Textarea
              label="Waiver text"
              value={templateContent}
              onChange={(e) => setTemplateContent(e.currentTarget.value)}
              minRows={6}
              required
            />
          )}
          <Switch
            label="Sign once per participant"
            checked={templateSignOnce}
            onChange={(e) => setTemplateSignOnce(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setTemplateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              loading={creatingTemplate}
              disabled={!templateTitle.trim()}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={productModalOpen && Boolean(selectedProduct)}
        onClose={closeProductModal}
        title="Edit product"
        centered
      >
        {selectedProduct && (
          <Stack gap="sm">
            <TextInput
              label="Name"
              value={editProductName}
              onChange={(e) => setEditProductName(e.currentTarget.value)}
              required
            />
            <NumberInput
              label="Price (USD)"
              min={0}
              decimalScale={2}
              hideControls
              value={editProductPrice}
              onChange={(value) => setEditProductPrice(value === '' ? '' : Number(value))}
              leftSection="$"
            />
            <Select
              label="Billing period"
              data={[
                { label: 'Month', value: 'month' },
                { label: 'Week', value: 'week' },
                { label: 'Year', value: 'year' },
              ]}
              value={editProductPeriod}
              onChange={(value) => setEditProductPeriod((value as any) ?? 'month')}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              value={editProductDescription}
              onChange={(e) => setEditProductDescription(e.currentTarget.value)}
              minRows={2}
            />
            <Group justify="space-between" mt="md">
              <Button
                variant="light"
                color="red"
                onClick={handleDeleteProduct}
                loading={deletingProduct}
              >
                Delete product
              </Button>
              <Group gap="xs">
                <Button variant="default" onClick={closeProductModal}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateProduct} loading={updatingProduct}>
                  Save changes
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
      <PaymentModal
        isOpen={showPurchaseModal && Boolean(purchaseProduct && purchasePaymentData)}
        onClose={() => {
          setShowPurchaseModal(false);
          setPurchasePaymentData(null);
          setPurchaseProduct(null);
        }}
        event={{
          name: purchaseProduct?.name ?? 'Product',
          location: org?.name ?? '',
          eventType: 'EVENT',
          price: purchaseProduct?.priceCents ?? 0,
        } as any}
        paymentData={purchasePaymentData}
        onPaymentSuccess={handleProductPaymentSuccess}
      />
    </>
  );
}
