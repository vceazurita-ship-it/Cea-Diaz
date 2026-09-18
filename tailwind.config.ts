import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      // Aquí vivía una escala de grises («ink») de cuando la app era sólo
      // oscura. Ya no hace falta: los grises salen de los tokens del modo, que
      // son los únicos que saben si toca papel o noche.
      keyframes: {
        pop: {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        floatUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // El portero del penalti, moviéndose en la línea. Un portero quieto
        // como un poste no da ninguna tensión, y esperar es la mitad del
        // penalti.
        vaiven: {
          '0%, 100%': { transform: 'translate(-50%, -50%) translateX(-8%)' },
          '50%': { transform: 'translate(-50%, -50%) translateX(8%)' },
        },
        // El rótulo de anime: entra de golpe, se pasa de tamaño y se asienta.
        golpe: {
          '0%': { opacity: '0', transform: 'scale(0.4) rotate(-6deg)' },
          '55%': { opacity: '1', transform: 'scale(1.15) rotate(-6deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(-6deg)' },
        },
        // Las rayas de velocidad, girando despacio detrás del que tira.
        girar: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        pop: 'pop 320ms ease-out',
        floatUp: 'floatUp 360ms ease-out both',
        shimmer: 'shimmer 2.4s linear infinite',
        vaiven: 'vaiven 1.9s ease-in-out infinite',
        golpe: 'golpe 380ms cubic-bezier(0.2, 1.4, 0.4, 1) both',
        girar: 'girar 14s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
