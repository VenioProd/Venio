import ScriptReportsView from '../../components/callScriptReport/ScriptReportsView'
import { REP_SCRIPT_REPORTS } from '../../services/callScriptReports'

/** Rapports de scripts du commercial externe : les siens seulement. */
export default function CommercialScriptReports() {
  return <ScriptReportsView base={REP_SCRIPT_REPORTS} />
}
