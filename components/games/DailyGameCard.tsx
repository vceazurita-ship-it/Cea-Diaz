'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { JuegoDe } from '@/components/games/Juegos';
import { Material } from '@/components/games/Material';
import { PenaltyShootout } from '@/components/games/PenaltyShootout';
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
import {
  PENALTY_SHOTS,
  isPenaltyDone,
  penaltyGate,
  penaltyResultFor,
  penaltyVerdict,
  type PenaltyGate,
} from '@/lib/penalties';
import { gameRewardId, rarityLabel } from '@/lib/rewards';
import { nivelesDelCole, tirosDelCole } from '@/lib/retoCole';
import { energiaDelFutbol } from '@/lib/retoFutbol';
import { computeDayScore } from '@/lib/scoring';
import { playCue } from '@/lib/sound';
import { loadSettings, subscribeSettings } from '@/lib/settings';
import { entryKey } from '@/lib/storage';
import { answerClass } from '@/lib/ui/tone';
import type {
  DateKey,
  DayEntry,
  GameQuestion,
  GameResult,
  PenaltyResult,
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
 *
 *  Y aquí se cobra una cosa más: la tanda de cinco penaltis. No da cromo ni
 *  puntos, da el derecho a tirar, que a esta edad es el premio que de verdad
 *  se quiere. La abren dos cosas juntas —tres aciertos de las cinco y más
 *  del 60 % del día hecho— o la abre a mano quien lleva la casa. Y se
 *  enseña también cerrada, con lo que falta para abrirla: un premio que no
 *  se sabe que existe no hace que nadie termine de registrar el día.
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
  /** Anota la tanda de penaltis. */
  onPenalty?: (result: PenaltyResult) => void;
}

/**
 * ¿Le han abierto la tanda a mano desde los ajustes?
 *
 * Se arranca en `false` y se corrige tras montar, como el resto de lo que
 * vive en el aparato: en el servidor no hay `localStorage`. Y se sigue
 * escuchando, porque quien la abre suele estar en otro móvil y lo normal es
 * que el crío tenga la pantalla delante cuando ocurre.
 */
export function useGranted(profileId: ProfileId): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const read = () => setGranted(loadSettings().penalties[profileId] === true);
    read();
    return subscribeSettings(read);
  }, [profileId]);

  return granted;
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
  onPenalty,
}: DailyGameCardProps) {
  const [open, setOpen] = useState(false);
  /** Pregunta que se está viendo. */
  const [index, setIndex] = useState(0);
  /** Opción tocada en esta pregunta; mientras es `null`, no se ha contestado. */
  const [chosen, setChosen] = useState<string | null>(null);
  /** La tanda de penaltis, que se abre encima de la partida. */
  const [shooting, setShooting] = useState(false);

  const round = useMemo(() => buildGameRound(profile, date), [profile, date]);
  const total = round.questions.length;

  const result = gameResultFor(entries, profile.id, date);
  const answered = result?.answered ?? 0;
  const correct = result?.correct ?? 0;
  const done = result ? isGameDone(result) : false;

  /** Sólo se juega el día que es: el juego de ayer ya pasó. */
  const today = isToday(date);
  const tomorrow = GAME_META[gameForDate(addDays(date, 1))];

  /**
   * La tanda de penaltis. La abren dos cosas juntas —tres aciertos y más del
   * 60 % del día— o la abre a mano quien lleva la casa. Lo tirado se lee del
   * día como todo lo demás, así que una tanda a medias se retoma.
   */
  const granted = useGranted(profile.id);
  const dayRatio = useMemo(
    () => computeDayScore(profile.id, date, entries[entryKey(profile.id, date)]).ratio,
    [profile.id, date, entries],
  );
  const penalties = penaltyResultFor(entries, profile.id, date);

  // Una tanda repetida hoy —la que se da desde los ajustes con «Otra tanda»—
  // cuenta como abierta a mano: si quien lleva la casa se la ha dado, es que
  // puede tirarla, se la haya ganado o no.
  const replayed = (penalties?.round ?? 0) > 0;
  const gate = penaltyGate({ correct, total, dayRatio, granted: granted || replayed });
  const penaltiesDone = penalties ? isPenaltyDone(penalties) : false;

  // Los tiros que se han ganado hoy en el reto del cole, y con qué nivel.
  const coleShots = tirosDelCole(entries, profile.id, date);
  const coleNiveles = nivelesDelCole(entries, profile.id, date);
  // Y el rayo de energía de más que da el reto de fútbol superado.
  const energiaExtra = energiaDelFutbol(entries, profile.id, date);
  const canShoot = Boolean(onPenalty) && gate.open && today;

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
        className={`${kid ? 'card-kid' : 'card'} p-3 sm:p-4 ${
          done && won ? 'border-accent bg-accent-faint' : ''
        }`}
      >
        {/* El titular y el juego en una fila, y lo demás a todo el ancho:
            con el icono en columna aparte, cada frase ocupaba el doble. */}
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-3xl surf-2" aria-hidden>
            {round.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={`${headingClass} !mb-0 !text-[11px]`}>Juego del día</h3>
            <p className="font-display text-base font-black leading-tight t-1">{round.title}</p>
          </div>
        </div>

        <div>
          <p className="mt-1.5 text-xs t-2">{round.tagline}</p>

          {state === 'por-jugar' && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-[10rem] flex-1 text-[11px] font-semibold leading-snug t-2">
                🎁 Cromo de cantera con {GAME_PASS} aciertos; uno de los grandes con pleno.
              </p>
              <button type="button" onClick={start} className="btn-primary shrink-0 px-4 text-sm">
                ▶️ Jugar las {total}
              </button>
            </div>
          )}

          {state === 'a-medias' && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-[10rem] flex-1 text-[11px] font-semibold leading-snug t-2">
                Partida empezada: vas por la {answered + 1} de {total}.
              </p>
              <button type="button" onClick={start} className="btn-primary shrink-0 px-4 text-sm">
                ⏵ Seguir la partida
              </button>
            </div>
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

          {/* La tanda, abierta o cerrada. Va fuera de los estados de la
              partida —y no dentro del «terminada», como estaba— porque no
              depende de ella sola: con tres aciertos ya está ahí aunque
              queden preguntas, y cerrada tiene que verse desde el principio
              para saber que existe y qué falta para abrirla. */}
          {onPenalty && today && (
            <Penaltis
              gate={gate}
              open={canShoot}
              result={penalties}
              done={penaltiesDone}
              onShoot={() => setShooting(true)}
            />
          )}

          {state === 'otro-dia' && (
            <p className="mt-2 text-[11px] leading-snug t-3">
              {result
                ? `El ${friendlyDateLabel(date).toLowerCase()} se jugó esta partida: ${correct}/${total} aciertos.`
                : `El juego se juega el mismo día, y el ${friendlyDateLabel(date).toLowerCase()} ya pasó. Vuelve a hoy para jugar.`}
              {penalties &&
                ` Y la tanda de penaltis acabó ${penalties.scored}/${penalties.total}.`}
            </p>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- la partida */}
      {open && (
        <Modal title={round.title} size="lg" dismissible={false} onClose={() => setOpen(false)}>
          {index >= total ? (
            <Scoreboard
              correct={correct}
              total={total}
              icon={round.icon}
              won={won}
              profileId={profile.id}
              tomorrow={`${tomorrow.icon} ${tomorrow.title}`}
              penalties={penalties}
              onShoot={
                canShoot && !penaltiesDone
                  ? () => {
                      setOpen(false);
                      setShooting(true);
                    }
                  : undefined
              }
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

      {/* ----------------------------------------------------- la tanda */}
      {shooting && onPenalty && (
        <Modal title="Penaltis contra Benji" size="lg" dismissible={false} onClose={() => setShooting(false)}>
          <PenaltyShootout
            profileId={profile.id}
            name={profile.name}
            date={date}
            result={penalties}
            cole={coleShots}
            coleNiveles={coleNiveles}
            energiaExtra={energiaExtra}
            onShot={onPenalty}
            onClose={() => setShooting(false)}
          />
        </Modal>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
 * La tanda, dentro de la tarjeta del juego
 *
 * Cerrada se enseña igual que abierta, y con las dos condiciones a la vista:
 * la que ya está y la que falta. Un premio escondido hasta que se cumple no
 * es un premio, es una sorpresa —y una sorpresa no hace que nadie termine de
 * registrar el día.
 * ----------------------------------------------------------------------- */

function Penaltis({
  gate,
  open,
  result,
  done,
  onShoot,
}: {
  gate: PenaltyGate;
  open: boolean;
  result: PenaltyResult | null;
  done: boolean;
  onShoot: () => void;
}) {
  if (!open) {
    return (
      <div className="mt-2 rounded-xl border p-2 hairline surf-1">
        <p className="text-[11px] font-bold leading-snug t-2">
          🔒 Tanda de {PENALTY_SHOTS} penaltis
        </p>
        <ul className="mt-1 space-y-0.5">
          {gate.parts.map((part) => (
            <li key={part.label} className="text-[11px] leading-snug t-3">
              <span aria-hidden>{part.done ? '✅' : '⬜'}</span>{' '}
              <span className={part.done ? 'font-semibold t-2' : ''}>{part.label}</span>{' '}
              <span className="tabular-nums">({part.detail})</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-accent bg-accent-faint p-2">
      <p className="text-[11px] font-semibold leading-snug t-1">
        🥅 {gate.granted ? 'Hoy te la han dado' : 'Te la has ganado'}: tanda de {PENALTY_SHOTS} penaltis contra Benji.
        {done
          ? ` Marcaste ${result?.scored} de ${result?.total}${result?.points ? ` y sacaste ${result.points} puntos` : ''}.`
          : result && result.taken > 0
            ? ` Vas por el ${result.taken + 1}, con ${result.points ?? 0} puntos.`
            : ''}
      </p>

      {!done && (
        <button type="button" onClick={onShoot} className="btn-primary mt-2 px-4 text-sm">
          {result && result.taken > 0 ? '⏵ Seguir la tanda' : '🥅 Tirar los penaltis'}
        </button>
      )}
    </div>
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
  /** Aciertos seguidos antes de ésta: con dos o más, la racha se celebra. */
  racha?: number;
  /** La última del reto, la que se juega contra Benji: se viste de final. */
  jefe?: boolean;
  /** El texto del botón de seguir, si no es el de siempre. */
  nextLabel?: string;
}

export function Question({ question, index, total, chosen, kid, onAnswer, onNext, racha = 0, jefe = false, nextLabel }: QuestionProps) {
  const hit = chosen === question.answer;
  const rachaAhora = hit ? racha + 1 : 0;

  // Un ruidito al contestar: el «ding» del acierto (más alto con racha) o el
  // «bup» del fallo. Sólo al pasar de sin contestar a contestada.
  const sonada = useRef<string | null>(null);
  useEffect(() => {
    if (!chosen || sonada.current === question.id) return;
    sonada.current = question.id;
    playCue(hit ? (rachaAhora >= 3 ? 'combo' : 'acierto') : 'fallo');
  }, [chosen, hit, rachaAhora, question.id]);

  return (
    <div className="space-y-4">
      {jefe && !chosen && (
        <div className="animate-golpe rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-3 py-2 text-center text-[12px] font-black uppercase tracking-widest text-white shadow-lg">
          ⚔️ Pregunta final · ¡la de Benji!
        </div>
      )}
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

      {/* El material de la pregunta; al contestar se enseña resuelto. */}
      {question.visual && <Material visual={question.visual} resuelto={Boolean(chosen)} />}

      {/* Si no es de elegir, el juego que sea: escribir, ordenar, emparejar… */}
      {question.juego ? (
        <JuegoDe question={question} chosen={chosen} kid={kid} onAnswer={(hit) => onAnswer(hit ? question.answer : 'x')} />
      ) : (
      <ul className="space-y-2">
        {question.options.map((option) => {
          const picked = chosen === option.id;
          const good = option.id === question.answer;

          // Al contestar se marca en verde la buena y en rojo la elegida si
          // no lo era: ver la correcta es la mitad de lo que se aprende.
          const tone = answerClass(option.id, chosen, question.answer);

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
      )}

      {chosen && (
        <div className="animate-floatUp space-y-3">
          <p className={`text-sm font-black ${hit ? 't-accent' : 't-1'}`} aria-live="polite">
            {hit ? '✅ ¡Correcto!' : '❌ No era ésa'}
            {rachaAhora >= 2 && (
              <span className="ml-2 inline-block animate-pop rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-[#241a14]">
                🔥 ¡{rachaAhora} seguidas!
              </span>
            )}
          </p>
          <p className="rounded-xl border p-3 text-[13px] leading-snug hairline surf-1 t-2">
            💡 {question.explain}
          </p>
          <button type="button" onClick={onNext} className="btn-primary w-full">
            {nextLabel ?? (index + 1 === total ? 'Ver el resultado' : 'Siguiente pregunta')}
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
  /** La tanda del día, si ya se tiró alguna. */
  penalties: PenaltyResult | null;
  /** Abre la tanda; ausente cuando todavía no está abierta o ya se tiró entera. */
  onShoot?: () => void;
  onClose: () => void;
}

function Scoreboard({
  correct,
  total,
  icon,
  won,
  profileId,
  tomorrow,
  penalties,
  onShoot,
  onClose,
}: ScoreboardProps) {
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

      {/* La tanda no se queda en el marcador: se cobra tirando. */}
      {onShoot && (
        <div className="rounded-2xl border p-4 border-accent bg-accent-faint">
          <p className="text-sm font-black t-1">🥅 Y ahora, penaltis</p>
          <p className="mt-1 text-[11px] leading-snug t-2">
            Te has ganado una tanda de cinco contra Benji. Él se coloca antes de volar y se acuerda de
            los rincones por los que ya le has marcado; busca las dianas y saca puntos.
          </p>
          <button type="button" onClick={onShoot} className="btn-primary mt-3 w-full">
            {penalties && penalties.taken > 0 ? 'Seguir la tanda' : 'Tirar la tanda'}
          </button>
        </div>
      )}

      {penalties && !onShoot && (
        <p className="text-sm font-semibold t-1">
          🥅 Tanda de penaltis: {penalties.scored} de {penalties.total}
          {penalties.points ? `, ${penalties.points} puntos` : ''}.{' '}
          <span className="font-normal t-2">{penaltyVerdict(penalties.scored, penalties.total)}</span>
        </p>
      )}

      <p className="text-[11px] t-3">Mañana toca {tomorrow}.</p>

      <button type="button" onClick={onClose} className="btn-primary w-full">
        Cerrar
      </button>
    </div>
  );
}
