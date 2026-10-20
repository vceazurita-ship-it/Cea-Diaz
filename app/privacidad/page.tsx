import type { Metadata } from 'next';

/* =========================================================================
 *  /privacidad — la política de privacidad.
 *
 *  Google la exige, pública y con dirección fija, para dejar que las cuentas
 *  de Google de la casa (el calendario, y el Classroom de los peques) se
 *  conecten a la app. Dice lo que la app hace de verdad: si cambia lo que se
 *  pide a Google, hay que cambiar esto también.
 * ========================================================================= */

export const metadata: Metadata = {
  title: 'Privacidad · Hábitos en familia',
  description: 'Qué datos usa la app de hábitos de la familia y qué hace con ellos.',
};

export default function Privacidad() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed t-1">
      <h1 className="mb-1 text-2xl font-bold">Política de privacidad</h1>
      <p className="mb-8 text-sm t-3">Hábitos en familia · actualizada el 20 de octubre de 2026</p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Qué es</h2>
      <p>
        Una aplicación privada para que una familia apunte sus hábitos, su agenda y el
        seguimiento escolar y deportivo de sus hijos. Sólo la usan los miembros de esa familia,
        con su propia cuenta; no está abierta al público ni tiene anuncios.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Qué datos de Google usa</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Google Calendar</strong>: crea, cambia y borra los eventos que la propia app
          añade (los recados con fecha) y lista los calendarios de la cuenta para elegir en cuál
          caen. No lee otros eventos.
        </li>
        <li>
          <strong>Google Classroom</strong>, sólo lectura: las clases del alumno, sus tareas con
          fecha de entrega y el estado de su entrega, los avisos, los temas y los materiales.
          Sirve para enseñar lo que hay que entregar y para proponer ratos de estudio. La app no
          escribe nada en Classroom.
        </li>
        <li>El correo de la cuenta conectada, para saber cuál es.</li>
      </ul>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Dónde se guarda y quién lo ve</h2>
      <p>
        En la base de datos de la familia (Supabase), protegida por su sesión. El permiso de Google
        se guarda cifrado y sólo lo usa el servidor de la app. Los datos no se venden, no se ceden a
        terceros, no se usan para publicidad ni para entrenar modelos de inteligencia artificial, y
        no se envían a ningún otro servicio.
      </p>

      <h2 className="mb-2 mt-6 text-lg font-semibold">Cómo retirarlo</h2>
      <p>
        Desde la propia app («Desconectar»), que revoca el permiso y borra lo guardado, o en
        cualquier momento desde{' '}
        <a className="underline" href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <p className="mt-8 text-sm t-3">
        El uso de la información recibida de las API de Google se ajusta a la{' '}
        <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , incluidos los requisitos de uso limitado.
      </p>
    </main>
  );
}
