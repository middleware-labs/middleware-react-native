export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  emoji: string;
}

/** Mirrors the native Coffee Cart samples' menu. */
export const PRODUCTS: Product[] = [
  {
    id: 'espresso',
    name: 'Espresso',
    description: 'A strong shot of pure coffee.',
    price: 2.5,
    emoji: '☕',
  },
  {
    id: 'cappuccino',
    name: 'Cappuccino',
    description: 'Espresso with steamed milk foam.',
    price: 3.5,
    emoji: '🥛',
  },
  {
    id: 'latte',
    name: 'Latte',
    description: 'Smooth espresso with lots of milk.',
    price: 3.8,
    emoji: '🍼',
  },
  {
    id: 'mocha',
    name: 'Mocha',
    description: 'Chocolate meets coffee.',
    price: 4.2,
    emoji: '🍫',
  },
  {
    id: 'americano',
    name: 'Americano',
    description: 'Espresso with hot water.',
    price: 2.8,
    emoji: '💧',
  },
  {
    id: 'flat-white',
    name: 'Flat White',
    description: 'Velvety microfoam over a double shot.',
    price: 3.9,
    emoji: '🫖',
  },
];
