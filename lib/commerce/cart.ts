/**
 * Slice 3 (Commerce). Every mutation here takes `userAccountId` and folds it
 * into the query itself (never fetch-then-check) — the same "ownership is
 * the filter, not a separate authorization step" pattern already used for
 * My Néctar (`canManageOwnProfile`, RBAC.md §5): a Cart/CartItem has no
 * classification axis, it's simply never visible to anyone but its owner.
 */
import { prisma } from "../db";

export class AddToCartError extends Error {}

async function getOrCreateActiveCart(userAccountId: string) {
  const existing = await prisma.cart.findFirst({
    where: { userAccountId, status: "active" },
  });
  if (existing) return existing;
  return prisma.cart.create({ data: { userAccountId, status: "active" } });
}

export async function getCart(userAccountId: string) {
  const cart = await prisma.cart.findFirst({
    where: { userAccountId, status: "active" },
    include: {
      items: {
        include: { productVariant: { include: { product: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return cart;
}

export async function addToCart(userAccountId: string, productVariantId: string, quantity: number) {
  if (quantity < 1) throw new AddToCartError("quantity_invalid");

  const variant = await prisma.productVariant.findUnique({
    where: { id: productVariantId },
    include: { product: true },
  });

  if (!variant || variant.status !== "active") {
    throw new AddToCartError("variant_unavailable");
  }
  // Same public gate as lib/discover/service.ts — a variant of a
  // non-public/non-approved Product is never purchasable, regardless of
  // whether the viewer somehow has the variant's ID.
  if (variant.product.classification !== "public" || variant.product.status !== "approved") {
    throw new AddToCartError("variant_unavailable");
  }

  const cart = await getOrCreateActiveCart(userAccountId);

  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_productVariantId: { cartId: cart.id, productVariantId } },
  });

  const desiredQuantity = (existingItem?.quantity ?? 0) + quantity;
  if (variant.inventoryCount !== null && desiredQuantity > variant.inventoryCount) {
    throw new AddToCartError("insufficient_inventory");
  }

  if (existingItem) {
    await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: desiredQuantity },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productVariantId, quantity },
    });
  }
}

/** Set to 0 to remove the item. Returns false if the item isn't in this user's cart. */
export async function updateCartItemQuantity(
  userAccountId: string,
  cartItemId: string,
  quantity: number,
): Promise<boolean> {
  if (quantity <= 0) {
    const result = await prisma.cartItem.deleteMany({
      where: { id: cartItemId, cart: { userAccountId, status: "active" } },
    });
    return result.count === 1;
  }

  const result = await prisma.cartItem.updateMany({
    where: { id: cartItemId, cart: { userAccountId, status: "active" } },
    data: { quantity },
  });
  return result.count === 1;
}
