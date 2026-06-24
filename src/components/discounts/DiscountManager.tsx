"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

import CentsInput from "@/components/ui/CentsInput";
import { apiRequest } from "@/lib/apiClient";
import {
  discountService,
  type Discount,
  type DiscountOwnerType,
  type DiscountTargetType,
} from "@/lib/discountService";
import { formatPrice } from "@/types";

type DiscountItemType = DiscountTargetType | "MEMBERSHIP";
type DiscountMode = "PERCENT" | "FLAT";

type DiscountTargetOption = {
  id: string;
  label: string;
  description?: string | null;
  priceCents: number;
  itemType: DiscountItemType;
  targetType: DiscountTargetType;
};

type DiscountManagerProps = {
  ownerType: DiscountOwnerType;
  ownerId?: string;
  title?: string;
};

const ITEM_TYPE_OPTIONS: Array<{ label: string; value: DiscountItemType }> = [
  { label: "Event", value: "EVENT" },
  { label: "Product", value: "PRODUCT" },
  { label: "Membership", value: "MEMBERSHIP" },
  { label: "Team registration", value: "TEAM_REGISTRATION" },
];

const formatTargetType = (value: string): string => {
  if (value === "TEAM_REGISTRATION") return "Team registration";
  if (value === "MEMBERSHIP") return "Membership";
  return value.charAt(0) + value.slice(1).toLowerCase();
};

const clampCents = (value: number, maxCents: number): number => (
  Math.min(Math.max(0, Math.round(value)), Math.max(0, Math.round(maxCents)))
);

const calculatePercentFromPrice = (originalCents: number, discountedCents: number): number => {
  if (originalCents <= 0) return 0;
  return Math.min(100, Math.max(0, Number((((originalCents - discountedCents) / originalCents) * 100).toFixed(2))));
};

export default function DiscountManager({
  ownerType,
  ownerId,
  title = "Discounts",
}: DiscountManagerProps) {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [discountsError, setDiscountsError] = useState<string | null>(null);
  const [itemType, setItemType] = useState<DiscountItemType>("EVENT");
  const [targetSearch, setTargetSearch] = useState("");
  const [targets, setTargets] = useState<DiscountTargetOption[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<DiscountMode>("PERCENT");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmountCents, setDiscountAmountCents] = useState(0);
  const [newPriceCents, setNewPriceCents] = useState(0);
  const [creatingDiscount, setCreatingDiscount] = useState(false);
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({});
  const [usageLimitInputs, setUsageLimitInputs] = useState<Record<string, number | "">>({});
  const [generatingCodeId, setGeneratingCodeId] = useState<string | null>(null);

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === targetId) ?? null,
    [targetId, targets],
  );
  const originalPriceCents = selectedTarget?.priceCents ?? 0;

  const loadDiscounts = useCallback(async () => {
    setLoadingDiscounts(true);
    setDiscountsError(null);
    try {
      const rows = await discountService.listDiscounts({ ownerType, ownerId });
      setDiscounts(rows);
    } catch (error) {
      setDiscountsError(error instanceof Error ? error.message : "Failed to load discounts.");
    } finally {
      setLoadingDiscounts(false);
    }
  }, [ownerId, ownerType]);

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    setTargetsError(null);
    try {
      const params = new URLSearchParams();
      params.set("ownerType", ownerType);
      if (ownerId) params.set("ownerId", ownerId);
      params.set("itemType", itemType);
      if (targetSearch.trim()) params.set("query", targetSearch.trim());
      const result = await apiRequest<{ targets?: DiscountTargetOption[]; error?: string }>(
        `/api/discounts/targets?${params.toString()}`,
      );
      if (result?.error) {
        throw new Error(result.error);
      }
      setTargets(result.targets ?? []);
    } catch (error) {
      setTargets([]);
      setTargetsError(error instanceof Error ? error.message : "Failed to load discount targets.");
    } finally {
      setTargetsLoading(false);
    }
  }, [itemType, ownerId, ownerType, targetSearch]);

  useEffect(() => {
    void loadDiscounts();
  }, [loadDiscounts]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadTargets();
    }, 200);
    return () => window.clearTimeout(handle);
  }, [loadTargets]);

  useEffect(() => {
    setTargetId(null);
    setNewPriceCents(0);
    setDiscountAmountCents(0);
    setDiscountPercent(0);
  }, [itemType]);

  useEffect(() => {
    if (!selectedTarget) {
      setNewPriceCents(0);
      setDiscountAmountCents(0);
      setDiscountPercent(0);
      return;
    }
    setNewPriceCents(selectedTarget.priceCents);
    setDiscountAmountCents(0);
    setDiscountPercent(0);
  }, [selectedTarget]);

  const targetOptions = useMemo(
    () => targets.map((target) => ({
      value: target.id,
      label: `${target.label} (${formatPrice(target.priceCents)})`,
    })),
    [targets],
  );

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setTargetId(null);
    setTargetSearch("");
    setDiscountPercent(0);
    setDiscountAmountCents(0);
    setNewPriceCents(0);
  }, []);

  const handlePercentChange = useCallback((value: string | number) => {
    const percent = Math.min(100, Math.max(0, Number(value) || 0));
    const nextPrice = clampCents(originalPriceCents - ((originalPriceCents * percent) / 100), originalPriceCents);
    setDiscountPercent(percent);
    setNewPriceCents(nextPrice);
    setDiscountAmountCents(clampCents(originalPriceCents - nextPrice, originalPriceCents));
  }, [originalPriceCents]);

  const handleDiscountAmountChange = useCallback((value: number) => {
    const amount = clampCents(value, originalPriceCents);
    const nextPrice = clampCents(originalPriceCents - amount, originalPriceCents);
    setDiscountAmountCents(amount);
    setNewPriceCents(nextPrice);
    setDiscountPercent(calculatePercentFromPrice(originalPriceCents, nextPrice));
  }, [originalPriceCents]);

  const handleNewPriceChange = useCallback((value: number) => {
    const price = clampCents(value, originalPriceCents);
    setNewPriceCents(price);
    setDiscountAmountCents(clampCents(originalPriceCents - price, originalPriceCents));
    setDiscountPercent(calculatePercentFromPrice(originalPriceCents, price));
  }, [originalPriceCents]);

  const handleCreateDiscount = useCallback(async () => {
    if (!selectedTarget) {
      notifications.show({ color: "red", message: "Select an item for this discount." });
      return;
    }
    if (!name.trim()) {
      notifications.show({ color: "red", message: "Discount name is required." });
      return;
    }
    try {
      setCreatingDiscount(true);
      await discountService.createDiscount({
        ownerType,
        ownerId,
        name: name.trim(),
        description: description.trim() || undefined,
        targetType: selectedTarget.targetType,
        targetId: selectedTarget.id,
        discountedPriceCents: clampCents(newPriceCents, selectedTarget.priceCents),
      });
      notifications.show({ color: "green", message: "Discount created." });
      resetForm();
      await loadDiscounts();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Failed to create discount.",
      });
    } finally {
      setCreatingDiscount(false);
    }
  }, [description, loadDiscounts, name, newPriceCents, ownerId, ownerType, resetForm, selectedTarget]);

  const handleGenerateCode = useCallback(async (discountId: string) => {
    try {
      setGeneratingCodeId(discountId);
      const usageLimitValue = usageLimitInputs[discountId];
      await discountService.generateCode(discountId, {
        code: codeInputs[discountId]?.trim() || undefined,
        usageLimit: typeof usageLimitValue === "number" ? usageLimitValue : null,
      });
      setCodeInputs((current) => ({ ...current, [discountId]: "" }));
      setUsageLimitInputs((current) => ({ ...current, [discountId]: "" }));
      notifications.show({ color: "green", message: "Discount code generated." });
      await loadDiscounts();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Failed to generate discount code.",
      });
    } finally {
      setGeneratingCodeId(null);
    }
  }, [codeInputs, loadDiscounts, usageLimitInputs]);

  return (
    <Stack gap="lg">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={4}>{title}</Title>
            <Text size="sm" c="dimmed">
              Create item-specific discounts and generate checkout codes.
            </Text>
          </div>
          <Button variant="light" size="xs" onClick={loadDiscounts} loading={loadingDiscounts}>
            Refresh
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <TextInput
            label="Discount name"
            placeholder="Early registration"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />
          <Select
            label="Item type"
            data={ITEM_TYPE_OPTIONS}
            value={itemType}
            onChange={(value) => setItemType((value as DiscountItemType) ?? "EVENT")}
            allowDeselect={false}
          />
          <Select
            label="Item"
            placeholder={targetsLoading ? "Loading items..." : "Search and select an item"}
            data={targetOptions}
            value={targetId}
            onChange={setTargetId}
            searchValue={targetSearch}
            onSearchChange={setTargetSearch}
            searchable
            clearable
            nothingFoundMessage={targetsLoading ? "Loading..." : "No paid items found"}
            rightSection={targetsLoading ? <Loader size="xs" /> : undefined}
          />
          <Textarea
            label="Description"
            placeholder="Optional internal note"
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            minRows={1}
          />
        </SimpleGrid>

        {targetsError ? <Alert color="red" mt="md">{targetsError}</Alert> : null}

        {selectedTarget ? (
          <Paper withBorder radius="md" p="md" mt="md">
            <Group justify="space-between" align="center" mb="md">
              <div>
                <Text fw={700}>{selectedTarget.label}</Text>
                <Text size="sm" c="dimmed">
                  Current price: {formatPrice(selectedTarget.priceCents)}
                  {selectedTarget.description ? ` • ${selectedTarget.description}` : ""}
                </Text>
              </div>
              <Badge variant="light">{formatTargetType(selectedTarget.itemType)}</Badge>
            </Group>
            <SegmentedControl
              value={mode}
              onChange={(value) => setMode(value as DiscountMode)}
              data={[
                { label: "Percent", value: "PERCENT" },
                { label: "Flat amount", value: "FLAT" },
              ]}
              mb="md"
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {mode === "PERCENT" ? (
                <NumberInput
                  label="Discount percent"
                  min={0}
                  max={100}
                  suffix="%"
                  decimalScale={2}
                  value={discountPercent}
                  onChange={handlePercentChange}
                />
              ) : (
                <CentsInput
                  label="Discount amount"
                  value={discountAmountCents}
                  onChange={handleDiscountAmountChange}
                  maxCents={selectedTarget.priceCents}
                />
              )}
              <CentsInput
                label="New price"
                value={newPriceCents}
                onChange={handleNewPriceChange}
                maxCents={selectedTarget.priceCents}
                blankWhenZero={false}
              />
            </SimpleGrid>
            <Group justify="space-between" mt="md">
              <Text size="sm" c="dimmed">
                Discount saved as final price: {formatPrice(clampCents(newPriceCents, selectedTarget.priceCents))}
              </Text>
              <Button onClick={handleCreateDiscount} loading={creatingDiscount}>
                Create discount
              </Button>
            </Group>
          </Paper>
        ) : null}
      </Paper>

      <Paper withBorder radius="md" p="md">
        <Group justify="space-between" mb="md">
          <div>
            <Title order={4}>Discount items</Title>
            <Text size="sm" c="dimmed">
              Generate as many codes as needed for each discount.
            </Text>
          </div>
        </Group>
        {discountsError ? <Alert color="red" mb="md">{discountsError}</Alert> : null}
        {loadingDiscounts ? (
          <Text c="dimmed">Loading discounts...</Text>
        ) : discounts.length === 0 ? (
          <Text c="dimmed">No discounts created yet.</Text>
        ) : (
          <Stack gap="md">
            {discounts.map((discount) => (
              <Paper key={discount.id} withBorder radius="md" p="md">
                <Group justify="space-between" align="flex-start" mb="sm">
                  <div>
                    <Text fw={700}>{discount.name}</Text>
                    <Text size="sm" c="dimmed">
                      {formatTargetType(discount.targetType)} • {formatPrice(discount.discountedPriceCents)} from {formatPrice(discount.originalPriceCentsSnapshot)}
                    </Text>
                    {discount.description ? <Text size="sm" c="dimmed">{discount.description}</Text> : null}
                  </div>
                  <Badge color={discount.status === "ACTIVE" ? "green" : "gray"} variant="light">
                    {discount.status}
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm" mb="md">
                  <TextInput
                    label="Code"
                    placeholder="Leave blank to generate"
                    value={codeInputs[discount.id] ?? ""}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setCodeInputs((current) => ({
                        ...current,
                        [discount.id]: value,
                      }));
                    }}
                  />
                  <NumberInput
                    label="Usage limit"
                    placeholder="Unlimited"
                    min={1}
                    value={usageLimitInputs[discount.id] ?? ""}
                    onChange={(value) => setUsageLimitInputs((current) => ({
                      ...current,
                      [discount.id]: typeof value === "number" ? value : "",
                    }))}
                  />
                  <Button
                    mt={{ base: 0, md: 25 }}
                    onClick={() => void handleGenerateCode(discount.id)}
                    loading={generatingCodeId === discount.id}
                  >
                    Generate code
                  </Button>
                </SimpleGrid>
                {(discount.codes ?? []).length > 0 ? (
                  <Table.ScrollContainer minWidth={520}>
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Code</Table.Th>
                          <Table.Th>Used</Table.Th>
                          <Table.Th>Limit</Table.Th>
                          <Table.Th>Status</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {(discount.codes ?? []).map((code) => (
                          <Table.Tr key={code.id}>
                            <Table.Td><Text fw={700}>{code.code}</Text></Table.Td>
                            <Table.Td>{code.usedCount}</Table.Td>
                            <Table.Td>{code.usageLimit ?? "Unlimited"}</Table.Td>
                            <Table.Td>{code.status}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                ) : (
                  <Text size="sm" c="dimmed">No codes generated for this discount.</Text>
                )}
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}
