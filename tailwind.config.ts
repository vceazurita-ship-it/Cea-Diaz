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
        // La pantalla que tiembla con el gol, como la cámara del anime.
        temblor: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '15%': { transform: 'translate(-6px, 3px)' },
          '30%': { transform: 'translate(5px, -4px)' },
          '45%': { transform: 'translate(-4px, -2px)' },
          '60%': { transform: 'translate(3px, 3px)' },
          '80%': { transform: 'translate(-2px, 1px)' },
        },
        // El fogonazo blanco del resultado: un instante y fuera.
        fogonazo: {
          '0%': { opacity: '0.85' },
          '100%': { opacity: '0' },
        },
        // El chispazo del golpeo: crece y se va.
        chispazo: {
          '0%': { opacity: '1', transform: 'translate(-50%, -50%) scale(0.3)' },
          '60%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1.1)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(1.3)' },
        },
        // La red que se hincha donde entra el balón.
        onda: {
          '0%': { opacity: '1', transform: 'translate(-50%, -50%) scale(0.2)' },
          '100%': { opacity: '0', transform: 'translate(-50%, -50%) scale(1.3)' },
        },
        // Las caras del cara a cara, entrando cada una por su lado.
        entra: {
          '0%': { opacity: '0', transform: 'translateX(-30%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'entra-dcha': {
          '0%': { opacity: '0', transform: 'translateX(30%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        // El botón de chutar cuando hay que soltar: late para que se vea.
        latido: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.03)' },
        },
      },
      animation: {
        pop: 'pop 320ms ease-out',
        floatUp: 'floatUp 360ms ease-out both',
        shimmer: 'shimmer 2.4s linear infinite',
        vaiven: 'vaiven 1.9s ease-in-out infinite',
        golpe: 'golpe 380ms cubic-bezier(0.2, 1.4, 0.4, 1) both',
        girar: 'girar 14s linear infinite',
        temblor: 'temblor 420ms ease-out',
        fogonazo: 'fogonazo 260ms ease-out both',
        chispazo: 'chispazo 320ms ease-out both',
        onda: 'onda 700ms ease-out both',
        entra: 'entra 420ms cubic-bezier(0.2, 1.2, 0.4, 1) both',
        'entra-dcha': 'entra-dcha 420ms cubic-bezier(0.2, 1.2, 0.4, 1) both',
        latido: 'latido 420ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
