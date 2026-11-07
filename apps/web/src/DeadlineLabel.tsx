import {byTime,overdue} from './deadlines'
import type {Card} from './deck'
export function DeadlineLabel({card}:{card:Card}){if(!card.deadline)return null;const late=overdue(card);return <span className={`deadline-label ${late?'is-overdue':''}`}>{byTime(card.deadline)}{late&&' · Overdue'}</span>}
