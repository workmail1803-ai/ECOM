import { z } from "zod";

/**
 * Checkout input validation.
 *
 * Note what is NOT here: no price, no subtotal, no total, no discount. The
 * client cannot submit money. `place_order()` re-quotes from live catalog rows
 * and writes its own figures. Adding a price field to this schema would be the
 * single most damaging change anyone could make to this codebase.
 */

/** Local BD mobile, post-normalisation: 01[3-9] + 8 digits. */
export const bdPhone = z
  .string()
  .trim()
  .transform((v) => {
    let digits = v.replace(/[^0-9]/g, "");
    // Strip the country code first, THEN restore the local leading zero.
    // These are sequential, not exclusive: +8801712345678 → 1712345678 →
    // 01712345678. Treating them as alternatives leaves a 10-digit number that
    // fails the check.
    if (digits.length === 13 && digits.startsWith("880")) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith("88")) digits = digits.slice(2);
    if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
    return digits;
  })
  .pipe(
    z
      .string()
      .regex(/^01[3-9][0-9]{8}$/, "Enter a valid Bangladeshi mobile number"),
  );

export const paymentMethodSchema = z.enum(["cod", "bkash", "nagad", "card"]);

export const checkoutSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(2, "Please enter the recipient's full name")
    .max(120),
  customer_phone: bdPhone,
  customer_email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  district: z.string().trim().min(2, "Select a district").max(80),
  area: z.string().trim().min(2, "Enter your area or thana").max(120),
  street: z
    .string()
    .trim()
    .min(5, "Enter the house and road so the courier can find you")
    .max(400),
  postcode: z.string().trim().max(12).optional().or(z.literal("")),
  landmark: z.string().trim().max(200).optional().or(z.literal("")),
  payment_method: paymentMethodSchema,
  customer_note: z.string().trim().max(500).optional().or(z.literal("")),
  address_id: z.string().uuid().optional().or(z.literal("")),
  save_address: z.coerce.boolean().optional().default(false),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().or(z.literal("")),
  recipient_name: z.string().trim().min(2, "Enter a name").max(120),
  phone: bdPhone,
  district: z.string().trim().min(2, "Select a district").max(80),
  area: z.string().trim().min(2, "Enter your area").max(120),
  street: z.string().trim().min(5, "Enter the full street address").max(400),
  postcode: z.string().trim().max(12).optional().or(z.literal("")),
  landmark: z.string().trim().max(200).optional().or(z.literal("")),
  is_default: z.coerce.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const trackOrderSchema = z.object({
  order_number: z
    .string()
    .trim()
    .min(3, "Enter your order number")
    .max(24)
    .transform((v) => v.toUpperCase()),
  phone: bdPhone,
});
