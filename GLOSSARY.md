# Asistencia 10°-A

Aplicación para el pase de lista diario del curso 10°-A de la IED Brisas del Río: registra la asistencia de cada estudiante por día, con calendario mensual, comentarios por caso particular, resumen mensual y exportación para las planillas institucionales.

## La lista y sus integrantes

**Curso**:
El grupo escolar 10°-A; la unidad a la que pertenece la lista de estudiantes.
_Avoid_: grado, grupo

**Estudiante**:
Integrante del curso, identificado por su nombre completo y su Mat. No.
_Avoid_: alumno, niño

**Mat. No.**:
Número interno de matrícula del estudiante en el colegio; el único identificador disponible (no hay documentos de identidad).
_Avoid_: código, ID

**Retirada**:
Estudiante que dejó el curso (traslado o retiro). Se conserva con su historial, no cuenta en estadísticas y puede reactivarse.
_Avoid_: inactiva, eliminada

## Los días

**Día de clase**:
Fecha en la que el curso tiene jornada y corresponde el pase de lista.
_Avoid_: día lectivo, día hábil

**Sin clase**:
Día marcado como no computable (festivo, jornada institucional, permiso, ausencia del docente). No genera faltas ni entra en estadísticas.
_Avoid_: feriado; «festivo» se usa solo como motivo

## El pase y los estados

**Pase diario**:
Registro de la asistencia de todos los estudiantes para un día concreto. Una sola marca por estudiante por día.
_Avoid_: sesión, clase, lista por hora

**Estado de asistencia**:
Condición de un estudiante en el pase del día: Presente, Ausente, Tarde o Excusa.
_Avoid_: marca, código

**Presente**:
El estudiante asistió a la jornada. Estado por defecto de todo el curso al abrir el día.

**Ausente**:
El estudiante no asistió y la falta no está justificada. Es el único estado que cuenta como falta.
_Avoid_: inasistencia; «Inas.» se reserva para la columna de la planilla

**Tarde**:
El estudiante llegó después del inicio de la jornada. Cuenta como asistencia y no como falta.
_Avoid_: retardo, impuntualidad

**Excusa**:
Ausencia justificada. Cuenta como falta justificada, no genera alertas y suele acompañarse del comentario y la etiqueta correspondientes.
_Avoid_: permiso, falta justificada

## Las anotaciones

**Observación**:
Comentario libre asociado a un estudiante en un día concreto, normalmente acompañado de una etiqueta rápida (excusa médica, cita médica, llegada tarde, disciplina, ajuste PIAR).
_Avoid_: nota, incidente

**Nota del día**:
Comentario general del día que no corresponde a un estudiante específico (p. ej. salida pedagógica).
_Avoid_: observación general

**Nota persistente**:
Aclaración que acompaña siempre a un estudiante, independiente de la fecha (p. ej. ajustes PIAR).
_Avoid_: alerta

## El resumen

**Resumen mensual**:
Cuadro del mes seleccionado, por estudiante: asistencias, faltas, tardes, excusas y porcentaje.
_Avoid_: reporte, corte, estadísticas

**Umbral de alerta**:
Criterio para resaltar a un estudiante en el resumen mensual: 3 o más faltas consecutivas, o 5 o más faltas acumuladas en el mes.
_Avoid_: límite, tolerancia

**Inas.**:
Columna de inasistencias de las planillas institucionales; el export mensual produce ese mismo conteo por estudiante.
_Avoid_: faltas; «faltas» es el conteo interno
