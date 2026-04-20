import { hostTest as test, expect } from "./fixtures/auth";
import { SEED_RENTAL_SLOT } from "./fixtures/seed-data";
import { rentalFieldsUrl } from "./utils/rental";

test.describe("rental creation (fields flow)", () => {
  test("host opens the rental slot workflow from organization fields", async ({
    page,
  }) => {
    await page.route("**/api/time-slots**", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (Array.isArray(payload?.timeSlots)) {
        payload.timeSlots = payload.timeSlots.map(
          (slot: Record<string, any>) => {
            const slotId = slot.$id ?? slot.id;
            if (slotId === SEED_RENTAL_SLOT.id) {
              return { ...slot, price: 0 };
            }
            return slot;
          },
        );
      }
      await route.fulfill({ response, json: payload });
    });

    await page.goto(rentalFieldsUrl, { waitUntil: "domcontentloaded" });
    const addRentalSlotButton = page.getByRole("button", {
      name: "Add Rental Slot",
    });
    await expect(addRentalSlotButton).toBeEnabled();

    await addRentalSlotButton.click();
    await expect(
      page.getByRole("dialog", { name: /Add Rental Slot/i }),
    ).toBeVisible();
  });
});
