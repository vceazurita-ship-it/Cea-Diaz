'use client';

import { useMemo, useState } from 'react';
import { CromoPortrait } from '@/components/ui/CromoPortrait';
import { Modal } from '@/components/ui/Modal';
import { addDays, friendlyDateLabel, isToday } from '@/lib/dates';
import {
  GAME_META,
  GAME_PASS,
  buildGameRound,
  gameForDate,
  gameResultFor,
  isGameDone,
} from '@/lib/games';
import { gameRewardId, rarityLabel } from '@/lib/rewards';
import type {
  DateKey,
  DayEntry,
  GameQuestion,
  GameResult,
  Profile,
  ProfileId,
  Reward,
  UnlockedReward,
} from '@/types';

/* =========================================================================
 *  El juego del día.
 *
 *  Una partida, cinco preguntas y un cromo si sale bien. La tarjeta enseña
 *  qué juego toca hoy y en qué punto está; el juego en sí se abre en una hoja
 *  aparte, a pantalla casi completa, porque a esa edad la pregunta tiene que
 *  ser lo único que se vea.
 *
 *  Cada respuesta se anota en cuanto se toca. No es un detalle técnico: es la
 *  regla del juego. Así cerrar la app en mitad de una pregunta fallada no
 *  regala otro intento, y a la vez se puede volver más tarde y seguir por
 *  donde se dejó.
 * ========================================================================= */

interface DailyGameCardProps {
  profile: Profile;
  date: DateKey;
  entries: Record<string, DayEntry>;
  /** El álbum ya calculado; de aquí sale el cromo que se acaba de ganar. */
  rewards: UnlockedReward[];
  kid: boolean;
  headingClass: string;
  /** Anota la partida en el día. */
  onResult: (result: GameResult) => void;
}

/** El cromo, en una línea. */
function rewardLine(profileId: ProfileId, reward: Reward): string {
  return reward.kind === 'cromo'
    ? `${rarityLabel(profileId, reward.rarity)}: ${reward.name} · ${reward.team}`
    : `«${reward.text}»`;
}

export function DailyGameCard({
  profile,
  date,
  entries,
  rewards,
  kid,
  headingClass,
  onResult,
}: DailyGameCardProps) {
  const [open, setOpen] = useState(false);
  /** Pregunta que se está viendo. */
  const [index, setIndex] = useState(0);
  /** Opción tocada en esta pregunta; mientras es `null`, no se ha contestado. */
  const [chosen, setChosen] = useState<string | null>(null);

  const round = useMemo(() => buildGameRound(profile, date), [profile, date]);
  const total = round.questions.length;

  const result = gameResultFor(entries, profile.id, date);
  const answered = result?.answered ?? 0;
  const correct = result?.correct ?? 0;
  const done = result ? isGameDone(result) : false;

  /** Sólo se juega el día que es: el juego de ayer ya pasó. */
  const today = isToday(date);
  const tomorrow = GAME_META[gameForDate(addDays(date, 1))];

  /** El cromo de esta partida, si cayó alguno. */
  const won = rewards.find((item) => item.challengeId === gameRewardId(round.game, date))?.reward;

  const start = () => {
    setIndex(answered);
    setChosen(null);
    setOpen(true);
  };

  /** Se contesta una vez y queda anotado al momento. */
  const answer = (optionId: string) => {
    if (chosen) return;
    setChosen(optionId);

    const hit = optionId === round.questions[index].answer;
    onResult({
      game: round.game,
      correct: correct + (hit ? 1 : 0),
      answered: answered + 1,
      total,
      at: new Date().toISOString(),
    });
  };

  const next = () => {
    setChosen(null);
    setIndex((value) => value + 1);
  };

  /* ------------------------------------------------------------ tarjeta */

  const state = !today
    ? 'otro-dia'
    : done
      ? 'terminada'
      : answered > 0
        ? 'a-medias'
        : 'por-jugar';

  return (
    <>
      <div
        className={`${kid ? 'card-kid' : 'card'} p-4 ${
          done && won ? 'border-accent bg-accent-faint' : ''
        }`}
      >
        <h3 className={headingClass}>Juego del día</h3>

        <div className="flex items-start gap-3">
          <span className="shrink-0 text-4xl" aria-hidden>
            {round.icon}
          </span>

          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-black t-1">{round.title}</p>
            <p className="mt-0.5 text-xs t-2">{round.tagline}</p>

            {state === 'por-jugar' && (
              <>
                <p className="mt-2 text-[11px] font-semibold leading-snug t-2">
                  🎁 En juego: cromo de cantera con {GAME_PASS} aciertos, y uno de los grandes
                  con pleno. Una partida al día, así que sin prisa.
                </p>
                <button type="button" onClick={start} className="btn-primary mt-3 px-4 text-sm">
                  ▶️ Jugar las {total} preguntas
                </button>
              </>
            )}

            {state === 'a-medias' && (
              <>
                <p className="mt-2 text-[11px] font-semibold leading-snug t-2">
                  Partida empezada: vas por la {answered + 1} de {total}.
                </p>
                <button type="button" onClick={start} className="btn-primary mt-3 px-4 text-sm">
                  ⏵ Seguir la partida
                </button>
              </>
            )}

            {state === 'terminada' && (
              <>
                <p className="mt-2 text-sm font-bold t-1">
                  {correct === total ? '🏆 ¡Pleno!' : correct >= GAME_PASS ? '✓ Superado' : '💪 Casi'}{' '}
                  <span className="tabular-nums">
                    {correct}/{total}
                  </span>{' '}
                  aciertos
                </p>

                <p
                  className={`mt-2 rounded-xl border p-2 text-[11px] font-semibold leading-snug ${
                    won ? 'border-accent bg-accent-faint t-1' : 'hairline surf-1 t-2'
                  }`}
                >
                  {won
                    ? `🎁 ${rewardLine(profile.id, won)}`
                    : `Hoy no ha caído cromo: hacen falta ${GAME_PASS} aciertos. Mañana hay otra.`}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setIndex(total);
                    setChosen(null);
                    setOpen(true);
                  }}
                  className="btn-ghost mt-3 px-3 py-1.5 text-xs"
                >
                  Ver cómo quedó
                </button>

                <p className="mt-2 text-[11px] t-3">
                  Mañana toca {tomorrow.icon} {tomorrow.title}.
                </p>
              </>
            )}

            {state === 'otro-dia' && (
              <p className="mt-2 text-[11px] leading-snug t-3">
                {result
                  ? `El ${friendlyDateLabel(date).toLowerCase()} se jugó esta partida: ${correct}/${total} aciertos.`
                  : `El juego se juega el mismo día, y el ${friendlyDateLabel(date).toLowerCase()} ya pasó. Vuelve a hoy para jugar.`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- la partida */}
      {open && (
        <Modal title={round.title} size="lg" onClose={() => setOpen(false)}>
          {index >= total ? (
            <Scoreboard
              correct={correct}
              total={total}
              icon={round.icon}
              won={won}
              profileId={profile.id}
              tomorrow={`${tomorrow.icon} ${tomorrow.title}`}
              onClose={() => setOpen(false)}
            />
          ) : (
            <Question
              question={round.questions[index]}
              index={index}
              total={total}
              chosen={chosen}
              kid={kid}
              onAnswer={answer}
              onNext={next}
            />
          )}
        </Modal>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
 * Una pregunta
 * ----------------------------------------------------------------------- */

interface QuestionProps {
  question: GameQuestion;
  index: number;
  total: number;
  chosen: string | null;
  kid: boolean;
  onAnswer: (optionId: string) => void;
  onNext: () => void;
}

function Question({ question, index, total, chosen, kid, onAnswer, onNext }: QuestionProps) {
  const hit = chosen === question.answer;

  return (
    <div className="space-y-4">
      {/* Por dónde va la partida */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide t-3">
          Pregunta {index + 1} de {total}
        </span>
        <span className="ml-auto flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 w-5 rounded-full ${i <= index ? 'bg-accent' : 'surf-3'}`}
            />
          ))}
        </span>
      </div>

      <p className={`font-semibold leading-snug t-1 ${kid ? 'text-lg' : 'text-base'}`}>
        <span className="mr-1.5" aria-hidden>
          {question.icon}
        </span>
        {question.prompt}
      </p>

      <ul className="space-y-2">
        {question.options.map((option) => {
          const picked = chosen === option.id;
          const good = option.id === question.answer;

          // Al contestar se marca en verde la buena y en rojo la elegida si
          // no lo era: ver la correcta es la mitad de lo que se aprende.
          const tone = !chosen
            ? 'hairline surf-1 hover-soft'
            : good
              ? 'border-emerald-400/60 bg-emerald-400/15'
              : picked
                ? 'border-rose-400/60 bg-rose-400/15'
                : 'hairline surf-1 opacity-50';

          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={Boolean(chosen)}
                onClick={() => onAnswer(option.id)}
                className={`btn w-full justify-start gap-3 border px-3 py-3 text-left
                            text-sm font-semibold leading-snug t-1 ${tone}
                            ${chosen ? 'disabled:opacity-100' : ''}`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                             text-xs font-black surf-2 t-2"
                  aria-hidden
                >
                  {chosen ? (good ? '✓' : picked ? '✕' : option.id.toUpperCase()) : option.id.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 whitespace-normal">{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen && (
        <div className="animate-floatUp space-y-3">
          <p className={`text-sm font-black ${hit ? 't-accent' : 't-1'}`} aria-live="polite">
            {hit ? '✅ ¡Correcto!' : '❌ No era ésa'}
          </p>
          <p className="rounded-xl border p-3 text-[13px] leading-snug hairline surf-1 t-2">
            💡 {question.explain}
          </p>
          <button type="button" onClick={onNext} className="btn-primary w-full">
            {index + 1 === total ? 'Ver el resultado' : 'Siguiente pregunta'}
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Cómo quedó
 * ----------------------------------------------------------------------- */

interface ScoreboardProps {
  correct: number;
  total: number;
  icon: string;
  won?: Reward;
  profileId: ProfileId;
  tomorrow: string;
  onClose: () => void;
}

function Scoreboard({ correct, total, icon, won, profileId, tomorrow, onClose }: ScoreboardProps) {
  const perfect = correct === total;

  return (
    <div className="space-y-4 text-center">
      <p className="text-5xl animate-pop" aria-hidden>
        {perfect ? '🏆' : correct >= GAME_PASS ? '🎉' : icon}
      </p>

      <p className="font-display text-2xl font-black tabular-nums t-1">
        {correct} de {total}
      </p>

      <p className="text-sm t-2">
        {perfect
          ? '¡Pleno! Ni una fallada.'
          : correct >= GAME_PASS
            ? 'Bien jugado: has pasado de sobra.'
            : `Hoy no ha salido. Con ${GAME_PASS} aciertos ya cae cromo.`}
      </p>

      {won && (
        <div className="rounded-2xl border p-4 border-accent bg-accent-faint">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] t-3">Premio</p>
          {won.kind === 'cromo' ? (
            <>
              <CromoPortrait cromo={won} size="lg" className="mt-1" />
              <p className="font-display text-lg font-black leading-tight t-1">{won.name}</p>
              <p className="text-xs font-semibold t-2">
                {won.team} · {won.position}
              </p>
              <p className="mt-1 text-[11px] leading-snug t-2">{won.dato}</p>
              <p className="mt-1 text-[11px] font-semibold italic t-1">«{won.lema}»</p>
              <p className="mt-2 text-[10px] t-3">
                {rarityLabel(profileId, won.rarity)} · ya está en tu álbum
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold t-1">«{won.text}»</p>
          )}
        </div>
      )}

      <p className="text-[11px] t-3">Mañana toca {tomorrow}.</p>

      <button type="button" onClick={onClose} className="btn-primary w-full">
        Cerrar
      </button>
    </div>
  );
}
