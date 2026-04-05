/**
 * Helpers per il rendering di <optgroup> con distinzione
 * visiva tra porte libere e occupate.
 *
 * Le porte occupate sono visibili (per trasparenza informativa)
 * ma DISABILITATE per impedire collegamenti doppi.
 */

/** Tipo minimale condiviso da SwitchPortDetail, PatchPortDetail e DevicePortDetail */
export interface PortLike {
  interface: {
    id: number
    name: string
    label?: string | null
  }
  linked_interface: {
    name: string
    device_name?: string | null
  } | null
}

interface PortGroupsProps {
  ports: PortLike[]
  /** ID della porta già selezionata in questa connessione — non viene disabilitata */
  currentPortId?: number | '' | null
  /** Funzione custom per il testo dell'option */
  labelFn?: (p: PortLike) => string
}

function defaultLabel(p: PortLike): string {
  return p.interface.name + (p.interface.label ? ` — ${p.interface.label}` : '')
}

function occupiedSuffix(p: PortLike): string {
  if (!p.linked_interface) return ''
  const dev  = p.linked_interface.device_name ?? '?'
  const port = p.linked_interface.name
  return `  [→ ${dev} / ${port}]`
}

/** Restituisce i due <optgroup> Libere / In uso */
export function PortOptionGroups({ ports, currentPortId, labelFn }: PortGroupsProps) {
  const toLabel = labelFn ?? defaultLabel
  const free     = ports.filter(p => !p.linked_interface || p.interface.id === Number(currentPortId))
  const occupied = ports.filter(p =>  p.linked_interface && p.interface.id !== Number(currentPortId))

  return (
    <>
      {free.length > 0 && (
        <optgroup label="── Libere">
          {free.map(p => (
            <option key={p.interface.id} value={p.interface.id}>
              {toLabel(p)}
            </option>
          ))}
        </optgroup>
      )}
      {occupied.length > 0 && (
        <optgroup label="── In uso">
          {occupied.map(p => (
            <option key={p.interface.id} value={p.interface.id} disabled>
              {toLabel(p)}{occupiedSuffix(p)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}
