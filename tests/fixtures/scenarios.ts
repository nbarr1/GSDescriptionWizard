/**
 * Twelve complete synthetic sessions spanning the branch matrix.
 *
 * These are the regression benchmark. Each is a plausible case a reporter could
 * actually file, answered the way a reasonably diligent user would - not the way
 * a perfect one would.
 *
 * Most answers are now picks rather than prose, which is the point of the
 * consolidation: the fixtures got shorter without losing investigative content.
 * Several deliberately seed a name, a badge number or an apostrophe so the
 * guards have something to catch.
 */

import type { AnswerValue, SessionState } from '../../src/types';
import { createSession, setAnswer, setChecklistItem } from '../../src/engine/flow';
import { questionsConfig } from '../../src/config';

type RawAnswers = Record<string, string | boolean | AnswerValue>;

export interface Scenario {
  id: string;
  title: string;
  /** What this fixture is here to exercise. */
  covers: string;
  answers: RawAnswers;
  /** Confirm every form cross-check item, unless the scenario says otherwise. */
  confirmAllFormItems?: boolean;
  /** Identifiers deliberately seeded so the PII guard has something to find. */
  seededPii?: string[];
}

const c = (value: string): AnswerValue => ({ kind: 'choice', value });
const m = (...values: string[]): AnswerValue => ({ kind: 'multi', values });
const esc = (hatch: 'unknown' | 'not_applicable', justification: string): AnswerValue => ({
  kind: 'escape',
  hatch,
  justification,
});

export function buildSession(scenario: Scenario): SessionState {
  let session = createSession();
  for (const [id, value] of Object.entries(scenario.answers)) {
    const answerValue: AnswerValue =
      typeof value === 'boolean'
        ? { kind: 'boolean', value }
        : typeof value === 'string'
          ? { kind: 'text', text: value }
          : value;
    session = setAnswer(session, id, answerValue);
  }
  if (scenario.confirmAllFormItems !== false) {
    for (const item of questionsConfig.formChecklist) {
      session = setChecklistItem(session, item.id, true);
    }
  }
  return session;
}

/** Conditions and response are shared shapes across most fixtures. */
const timing = (shift: string, overtime: string, task: string) => ({
  cond_time_into_shift: c(shift),
  cond_overtime: c(overtime),
  cond_time_into_task: c(task),
  cond_first_time: c('no'),
});

export const scenarios: Scenario[] = [
  {
    id: 'laceration-hand-tool',
    title: 'Acute laceration with a hand tool',
    covers: 'struck_against branch, seeded apostrophe and pronoun',
    seededPii: ['he'],
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('struck_against'),
      principal_body_part: c('finger'),
      employee_role: c('assembler'),
      discovery_mode: c('witnessed'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Opening a shrink wrapped bundle of cartons on the packing bench',
      task_stage: c('in_process'),
      task_purpose: c('behind_schedule'),

      procedure_reference: 'No written procedure exists for this task',
      procedure_followed: c('none_exists'),
      ppe_in_use: m('safety glasses', 'general purpose gloves'),
      ppe_specified: c('no'),

      equipment_identifier: 'Utility knife with a retractable blade from the tool crib',
      equipment_state: m('at_rest'),
      equipment_condition: c('worn'),
      equipment_condition_detail:
        "The blade hadn't been changed for several weeks and was noted as dull",
      object_weight: c('10_25'),
      object_size: m('bulky', 'no_handholds'),
      grip_method: m('one_hand', 'gloved'),

      sequence_before:
        'Standing at the packing bench with the bundle at waist height, left hand flat on top of it and the knife in the right hand about 6 inches away',
      posture_at_event: c('standing_upright'),
      sequence_moment:
        'The blade cut through the wrap sooner than expected, the knife continued travelling toward the body, and it contacted the left index finger resting on the wrap',
      sequence_after:
        'The knife was set down on the bench, the cut was covered with the right hand, and the team lead was called over',

      mech_struck_moving:
        'The knife blade was moving toward the body and the left index finger was stationary on the bundle',
      mech_struck_distance: c('under_1'),
      mech_struck_weight: c('under_10'),
      point_of_contact: 'Palm side of the left index finger at the middle joint',
      force_direction: c('toward_the_body'),

      cond_difference_from_normal:
        'The dull blade needed more force than usual, which is why the cut released suddenly',
      cond_environment_factors: m('time or production pressure'),
      cond_environment_detail:
        'The packing line was running behind and cartons were being opened faster than normal',
      ...timing('the second half of the shift', 'no_overtime', 'the first few minutes'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'Cutting toward the body has been raised at two toolbox talks and safety knives were requested for this bench about three months ago',
      cond_barriers_bypassed: c('yes'),
      cond_barriers_detail:
        'A self retracting safety knife is the specified control for this bench but none were available in the tool crib',
      cond_stop_work:
        'The employee could have waited for a safety knife to be issued, but that would have stopped the packing line for an unknown period',

      resp_first_aid: m('the wound was rinsed or irrigated', 'a sterile dressing was applied'),
      resp_first_aid_detail: 'Pressure applied for about five minutes to control bleeding',
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the scene was left undisturbed for EHS'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'overexertion-two-person-lift',
    title: 'Overexertion during a two-person lift',
    covers: 'overexertion branch, team lift, assist device available but unused',
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('overexertion'),
      principal_body_part: c('back_lower'),
      employee_role: c('material handler'),
      discovery_mode: c('witnessed'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Moving a pump casing from a floor pallet onto the maintenance bench',
      task_stage: c('transport'),
      task_purpose: c('routine'),

      procedure_reference: 'SW-221 Manual Handling of Rotating Equipment',
      procedure_followed: c('differed'),
      procedure_deviation:
        'The written method requires the overhead hoist for anything above 50 pounds, but the hoist was tagged out for inspection so the casing was lifted by hand',
      ppe_in_use: m('safety glasses', 'steel toe boots', 'general purpose gloves'),
      ppe_specified: c('yes'),

      equipment_identifier: 'Pump casing from unit P-118 and the maintenance bench in bay 3',
      equipment_state: m('at_rest'),
      equipment_condition: c('normal'),
      object_weight: c('75_100'),
      object_size: m('bulky', 'no_handholds'),
      grip_method: m('two_hands', 'underneath'),

      sequence_before:
        'Squatting at the near side of the pallet with the casing at floor level, feet apart and the second handler squatting opposite',
      posture_at_event: c('squatting'),
      sequence_moment:
        'The lift was called and both handlers raised the casing to about knee height, the far side was raised faster, the casing tilted toward the near handler, and the near handler twisted to the left to keep hold of it',
      sequence_after:
        'The casing was lowered back onto the pallet, the near handler stayed standing and reported pain across the lower back, and the lift was abandoned',

      mech_exert_weight: c('75_100'),
      mech_exert_from: c('floor'),
      mech_exert_to: c('knee'),
      mech_exert_reach: c('at about arm reach'),
      mech_exert_assist: c('an assist device exists but was out of service'),
      mech_exert_team: c('two_person'),
      mech_exert_team_detail:
        'The lift was called by the far handler, the far side was raised roughly a second early, and the load tipped toward the near handler',
      point_of_contact: 'Lower back on the left side',
      force_direction: c('from_in_front'),

      cond_difference_from_normal:
        'The hoist is normally used for this transfer and had been tagged out since the start of the shift',
      cond_environment_factors: m('restricted working space'),
      cond_environment_detail:
        'The bay was congested with parts staged for the rebuild, so the handlers could not stand square to the pallet',
      ...timing('the first half of the shift', 'no_overtime', 'the first few minutes'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'Risk assessment RA-118 covers manual handling of pump components and identifies loads above 50 pounds as requiring mechanical assistance',
      cond_barriers_bypassed: c('no'),
      cond_stop_work:
        'The rebuild could have waited for the hoist inspection to finish, but the unit was needed back in service the same day',

      resp_first_aid: m('a cold pack was applied'),
      resp_first_aid_detail: 'Cold pack held on the lower back for about 20 minutes',
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the supervisor', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the equipment was stopped'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'slip-wet-floor',
    title: 'Slip on a wet floor',
    covers: 'fall_same_level branch, environmental conditions, seeded badge number',
    seededPii: ['badge 448192'],
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('fall_same_level'),
      principal_body_part: c('hip'),
      employee_role: c('quality inspector'),
      discovery_mode: c('witnessed'),
      equipment_involved: false,
      object_handled: true,

      task_performed:
        'Walking from the inspection bench to the parts washer carrying a tote of samples',
      task_stage: c('walking'),
      task_purpose: c('routine'),

      procedure_reference: 'No written procedure exists for walking between these areas',
      procedure_followed: c('none_exists'),
      ppe_in_use: m('safety glasses', 'steel toe boots'),
      ppe_specified: c('yes'),

      object_weight: c('10_25'),
      object_size: m('bulky'),
      grip_method: m('two_hands', 'against_body'),

      sequence_before:
        'Walking at normal pace along the main aisle with the tote held in both arms at chest height, looking ahead rather than down',
      posture_at_event: c('carrying_load'),
      sequence_moment:
        'The right foot contacted a patch of coolant on the aisle floor, the foot slid forward, balance was lost backwards, and the fall was taken onto the right hip and the outstretched right hand',
      sequence_after:
        'The tote was dropped and the samples scattered, the inspector stayed on the floor for about a minute, and a passing operator called the team lead',

      mech_fall_surface: c('sealed concrete'),
      mech_fall_contaminant: m('oil or coolant'),
      mech_fall_foot_contact:
        'The right foot slid forward on the coolant, balance was lost backwards, and the fall was taken onto the right hip and the outstretched right hand',
      mech_fall_footwear: c('slip resistant safety boots with worn soles'),
      point_of_contact: 'Right hip, contacting the floor first',
      force_direction: c('from_below'),

      cond_difference_from_normal:
        'The coolant patch was new. Badge 448192 reported the same leak from the adjacent machine earlier in the shift',
      cond_environment_factors: m('a wet, oily or contaminated floor', 'poor or glaring lighting'),
      cond_environment_detail:
        'The aisle light above this section has been out for about two weeks',
      ...timing('the second half of the shift', 'overtime_today', 'the first few seconds'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'A coolant leak on the adjacent machine was raised as a near miss about two weeks ago and the action to reseal the housing is still open',
      cond_barriers_bypassed: c('yes'),
      cond_barriers_detail:
        'Spill absorbent and cones are kept at the end of the aisle but the spill had not been marked or contained when first seen',
      cond_stop_work:
        'The leak could have been reported and the aisle coned when it was first noticed earlier in the shift, but it was treated as a routine drip',

      resp_first_aid: m('a cold pack was applied'),
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the area was barriered off', 'a spill was contained'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'caught-in-guard-removal',
    title: 'Caught in during guard removal',
    covers: 'caught_in_between branch, bypassed interlock, open corrective action',
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('caught_in_between'),
      principal_body_part: c('hand'),
      employee_role: c('operator'),
      discovery_mode: c('witnessed'),
      equipment_involved: true,
      object_handled: false,

      task_performed: 'Clearing a jammed carton from the infeed conveyor at station 4',
      task_stage: c('troubleshooting'),
      task_purpose: c('fault'),

      procedure_reference: 'SW-114 Conveyor Jam Clearing rev C',
      procedure_followed: c('differed'),
      procedure_deviation:
        'The written method requires the belt to be stopped and locked out before reaching through the guard opening, but the interlock was bypassed with a spare key because a full stop needs a restart sequence taking about fifteen minutes',
      ppe_in_use: m('safety glasses', 'cut resistant gloves'),
      ppe_specified: c('yes'),

      equipment_identifier: 'Infeed conveyor CV-04 at station 4',
      equipment_state: m('energized', 'moving', 'guard_removed'),
      equipment_condition: c('known_fault'),
      equipment_condition_detail:
        'The guard latch has been sticking for about a month and is on the maintenance backlog',

      sequence_before:
        'Standing on the operator side of the conveyor, leaning over the side rail with the right arm extended into the guard opening and the left hand braced on the rail',
      posture_at_event: c('leaning_over_barrier'),
      sequence_moment:
        'The carton released suddenly, the belt restarted under its own control logic, and the right hand was drawn against the fixed steel edge of the guard opening',
      sequence_after:
        'A coworker hit the station e-stop after about three seconds, the hand was withdrawn, and the line was left stopped until the supervisor arrived',

      mech_caught_surfaces:
        'Between the moving conveyor belt and the fixed steel edge of the guard opening',
      mech_caught_entry:
        'The right hand was reaching through a 5 inch service gap in the guard to free the jammed carton without stopping the belt',
      mech_caught_release: c('a coworker hit the emergency stop'),
      point_of_contact: 'Back of the right hand at the base of the index and middle fingers',
      force_direction: c('from_the_side'),

      cond_difference_from_normal:
        'The jam occurred three times that shift where it normally happens about once a week, and the line had been running cartons from a new supplier since Monday',
      cond_environment_factors: m('time or production pressure', 'high noise'),
      cond_environment_detail:
        'The line was behind the build plan and the noise at the station makes it hard to hear the belt restart',
      cond_time_into_shift: c('the second half of the shift'),
      cond_overtime: c('consecutive_overtime'),
      cond_time_into_task: c('the first few seconds'),
      cond_first_time: c('no'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'A near miss was raised about four months ago for reaching into the same guard opening, and the action to fit a fixed shield is still open',
      cond_barriers_bypassed: c('yes'),
      cond_barriers_detail:
        'The interlock on the access door had been bypassed with a spare key kept at the station, and the guard has a 5 inch service opening that allows a hand to reach the belt while it runs',
      cond_stop_work:
        'The belt could have been stopped and locked out to clear the jam, but a full stop requires a restart sequence taking about fifteen minutes and the line was already behind',

      resp_first_aid: m('the wound was rinsed or irrigated', 'a sterile dressing was applied'),
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('emergency_room'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the equipment was locked and tagged out', 'the area was barriered off'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'gradual-shoulder-strain',
    title: 'Gradual onset shoulder strain',
    covers: 'gradual branch, posture picker, recent change in the work',
    answers: {
      onset_pattern: c('gradual'),
      injury_or_illness: c('injury'),
      accident_type: c('repetitive_motion'),
      principal_body_part: c('shoulder'),
      employee_role: c('assembler'),
      discovery_mode: c('self_reported_delayed'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Loading trays onto the overhead rack at the sub assembly station',
      task_stage: c('in_process'),
      task_purpose: c('routine'),

      procedure_reference: 'SW-402 Sub Assembly Tray Handling',
      procedure_followed: c('as_written'),
      ppe_in_use: m('safety glasses', 'general purpose gloves'),
      ppe_specified: c('yes'),

      equipment_identifier: 'Overhead tray rack at sub assembly station 2',
      equipment_state: m('at_rest'),
      equipment_condition: c('modified'),
      equipment_condition_detail:
        'The rack was raised by about 4 inches during a layout change two months ago',
      object_weight: c('10_25'),
      object_size: m('medium_two_hands'),
      grip_method: m('two_hands', 'handles'),

      gradual_task_frequency: c('over a hundred times per shift'),
      gradual_duration_at_task: c('six months to two years'),
      gradual_cycle_description:
        'Lift a tray from the cart at waist height, raise it with both arms extended to the rack at shoulder height, push it forward about 18 inches onto the rails, then lower the arms and turn back to the cart',
      posture_task: c('reaching_overhead'),
      gradual_force: c('moderate force'),

      gradual_symptom_onset:
        'Aching across the front of the right shoulder first noticed about six weeks ago, at first only towards the end of a shift',
      gradual_symptom_progression: c('worse and now present outside work'),
      gradual_recent_change:
        'The rack was raised by about 4 inches during a layout change roughly two months ago, and the tray count per shift went from 140 to 180 at the same time',

      mech_rep_motion:
        'Repeated overhead reach with the right arm raised above shoulder height and the elbow extended through the push onto the rails',
      mech_rep_frequency: c('over a hundred times per shift'),
      mech_rep_force: c('moderate force'),

      cond_difference_from_normal:
        'The rack height and the tray count both changed about two months ago and the station has not been reassessed since',
      cond_environment_factors: m('nothing notable'),
      ...timing('the second half of the shift', 'no_overtime', 'several hours in'),
      cond_known_hazard: c('no'),
      cond_barriers_bypassed: c('no'),
      cond_stop_work:
        'The symptoms could have been reported when first noticed six weeks ago, but they were mild and were expected to settle',

      resp_first_aid: m('no first aid was given at the scene'),
      resp_provider_role: c('none'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('at the end of the shift'),
      resp_delay_reason:
        'The aching was mild at first and was expected to settle with rest over the weekend',
      resp_scene: m('nothing was secured'),
      resp_work_status: c('modified'),
    },
  },

  {
    id: 'chemical-splash',
    title: 'Chemical splash to the forearm',
    covers: 'contact_chemical branch, isolation state, seeded name',
    seededPii: ['Michael'],
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('contact_chemical'),
      principal_body_part: c('arm'),
      employee_role: c('maintenance technician'),
      discovery_mode: c('witnessed'),
      equipment_involved: true,
      object_handled: false,

      task_performed:
        'Swapping the transfer hose on the parts washer at the quick disconnect fitting',
      task_stage: c('maintenance'),
      task_purpose: c('fault'),

      procedure_reference: 'WI-905 Parts Washer Hose Replacement',
      procedure_followed: c('as_written'),
      ppe_in_use: m('safety glasses', 'chemical gloves', 'a face shield'),
      ppe_specified: c('no'),

      equipment_identifier: 'Parts washer PW-02 transfer line at the quick disconnect fitting',
      equipment_state: m('pressurized', 'hot', 'energized'),
      equipment_condition: c('known_fault'),
      equipment_condition_detail:
        'The fitting had been weeping at the seal for about two shifts and was on the maintenance list',

      sequence_before:
        'Kneeling at the front of the washer with both hands on the quick disconnect and the left forearm resting across the frame about 8 inches below the fitting',
      posture_at_event: c('kneeling'),
      sequence_moment:
        'The disconnect released under residual pressure and heated wash solution sprayed downward across the inner left forearm between the glove cuff and the sleeve',
      sequence_after:
        'The technician pulled back from the machine, called out to Michael at the next bay, and walked to the emergency shower about 20 feet away',

      mech_energy_source:
        'Heated caustic wash solution from the parts washer transfer line at the quick disconnect fitting',
      mech_energy_magnitude: 'About 180 degrees Fahrenheit at roughly 4 percent caustic',
      mech_contact_duration: c('a few seconds'),
      mech_isolation_state: m(
        'the line was drained but still pressurized',
        'isolation is not required by the written method',
      ),
      point_of_contact: 'Inner left forearm from the wrist to below the elbow',
      force_direction: c('from_above'),

      cond_difference_from_normal:
        'The line normally depressurizes overnight, but this swap was done mid shift with the washer still warm',
      cond_environment_factors: m('restricted working space', 'heat'),
      cond_environment_detail:
        'The space in front of the washer is tight and the technician had to kneel with the forearm on the frame to reach the fitting',
      ...timing('the first half of the shift', 'no_overtime', 'roughly half an hour in'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'The weeping fitting had been reported on the previous shift and a work order was open at the time of the event',
      cond_barriers_bypassed: c('yes'),
      cond_barriers_detail:
        'Sleeve protection is available in stores but is not listed in the written method for this task, so none was worn',
      cond_stop_work:
        'The swap could have waited until end of shift when the washer had cooled and the line had depressurized',

      resp_first_aid: m('an emergency shower was used', 'a sterile dressing was applied'),
      resp_first_aid_detail: 'Irrigated at the emergency shower for about 15 minutes',
      resp_provider_role: c('emergency_response_team'),
      resp_evaluation: c('emergency_room'),
      resp_notified: m('the supervisor', 'EHS', 'the site emergency response team'),
      resp_elapsed: c('immediately'),
      resp_scene: m('the equipment was locked and tagged out', 'the area was barriered off'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'fall-from-ladder',
    title: 'Fall from a ladder',
    covers: 'fall_elevation branch, fall protection required vs available vs used',
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('fall_elevation'),
      principal_body_part: c('ankle'),
      employee_role: c('maintenance technician'),
      discovery_mode: c('witnessed'),
      equipment_involved: true,
      object_handled: true,

      task_performed:
        'Closing an isolation valve on the overhead compressed air line above the assembly cell',
      task_stage: c('maintenance'),
      task_purpose: c('routine'),

      procedure_reference: 'WI-330 Compressed Air Line Isolation',
      procedure_followed: c('differed'),
      procedure_deviation:
        'The written method calls for the valve to be reached from the mobile platform, but the platform was in use elsewhere so a stepladder was used instead',
      ppe_in_use: m('safety glasses', 'steel toe boots', 'general purpose gloves'),
      ppe_specified: c('yes'),

      equipment_identifier:
        'An 8 foot fiberglass stepladder, asset 20114, and the overhead air isolation valve',
      equipment_state: m('at_rest'),
      equipment_condition: c('normal'),
      object_weight: c('under_10'),
      object_size: m('small_one_hand'),
      grip_method: m('one_hand'),

      sequence_before:
        'Standing on the third step of the stepladder with the left hand on the rail and the right arm extended up and out to the left toward the valve',
      posture_at_event: c('on_ladder'),
      sequence_moment:
        'The ladder shifted to the left as the reach extended past the side rail, the left foot came off the step, and the fall was taken onto the concrete landing on the right foot',
      sequence_after:
        'The wrench was dropped clear, the technician sat on the floor unable to bear weight on the right foot, and a nearby operator called the supervisor',

      mech_fall_height: c('under_4'),
      mech_fall_working_surface:
        'An 8 foot fiberglass stepladder set on sealed concrete with one leg resting partly on a cable tray cover, landing on sealed concrete',
      mech_fp_required: c('no'),
      mech_fp_available: c('no'),
      mech_fp_used: c('no'),
      mech_fall_initiator:
        'The ladder shifted to the left as the reach extended out past the side rail toward the valve',
      mech_fall_footwear: c('slip resistant safety boots in good condition'),
      point_of_contact: 'Right ankle, rolling outward on landing',
      force_direction: c('from_below'),

      cond_difference_from_normal:
        'The mobile platform is normally used for this valve and was unavailable, and the cable tray cover made the ladder footing uneven',
      cond_environment_factors: m('restricted working space', 'an uneven or obstructed floor'),
      cond_environment_detail:
        'The floor under the valve carries a cable tray cover about 2 inches proud, so the ladder could not be set level',
      ...timing('the first hour of the shift', 'no_overtime', 'the first few minutes'),
      cond_known_hazard: c('no'),
      cond_barriers_bypassed: c('no'),
      cond_stop_work:
        'The job could have waited for the mobile platform to become available, but the repair was scheduled for that morning',

      resp_first_aid: m('a cold pack was applied'),
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('emergency_room'),
      resp_notified: m('the supervisor', 'EHS'),
      resp_elapsed: c('immediately'),
      resp_scene: m('the scene was left undisturbed for EHS', 'the area was barriered off'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'thermal-burn',
    title: 'Thermal burn from a heated platen',
    covers: 'contact_temperature branch, guard opened for changeover',
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('contact_temperature'),
      principal_body_part: c('hand'),
      employee_role: c('operator'),
      discovery_mode: c('self_reported_immediate'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Removing a misfed sheet from the laminating press during a size changeover',
      task_stage: c('teardown'),
      task_purpose: c('changeover'),

      procedure_reference: 'SW-508 Laminator Changeover',
      procedure_followed: c('differed'),
      procedure_deviation:
        'The written method requires the platens to cool below 120 degrees Fahrenheit before the press is entered, but the sheet was cleared at running temperature to save about forty minutes of cooling',
      ppe_in_use: m('safety glasses', 'general purpose gloves'),
      ppe_specified: c('no'),

      equipment_identifier: 'Laminating press LP-03, upper heated platen',
      equipment_state: m('hot', 'de_energized', 'guard_removed'),
      equipment_condition: c('normal'),
      object_weight: c('under_10'),
      object_size: m('long', 'awkward_shifting'),
      grip_method: m('one_hand', 'gloved'),

      sequence_before:
        'Standing at the front of the press with the guard swung open and the right arm extended into the press about 18 inches, hand on the near corner of the sheet',
      posture_at_event: c('reaching_forward'),
      sequence_moment:
        'The sheet tore as it was pulled, the right hand travelled forward, and the back of the hand contacted the underside of the upper heated platen',
      sequence_after:
        'The hand was withdrawn immediately, the operator stepped back from the press and walked to the sink, and the changeover was stopped',

      mech_energy_source: 'The upper heated platen of laminating press LP-03',
      mech_energy_magnitude: 'About 300 degrees Fahrenheit at the platen surface',
      mech_contact_duration: c('momentary'),
      mech_isolation_state: m('the source had not been allowed to cool'),
      point_of_contact: 'Back of the right hand between the knuckles and the wrist',
      force_direction: c('from_above'),

      cond_difference_from_normal:
        'The changeover was done between shifts rather than at the scheduled slot, so no time was allowed for the platens to cool',
      cond_environment_factors: m('heat', 'time or production pressure'),
      cond_environment_detail:
        'The area in front of the press runs warm during a changeover and the crew were working to hand over at shift change',
      ...timing('the last hour of the shift', 'no_overtime', 'roughly half an hour in'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'Heat resistant gloves are specified in the risk assessment for this press but are not stocked at the station',
      cond_barriers_bypassed: c('yes'),
      cond_barriers_detail:
        'The front guard was swung open to reach the sheet, and opening it does not prevent access to the platens while they are hot',
      cond_stop_work:
        'The changeover could have been left for the incoming shift once the platens had cooled, but the handover was already late',

      resp_first_aid: m(
        'the area was cooled under running water',
        'a sterile dressing was applied',
      ),
      resp_first_aid_detail: 'Held under cool running water for about 20 minutes',
      resp_provider_role: c('self'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the equipment was stopped'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'struck-by-dropped-material',
    title: 'Struck by dropped material',
    covers: 'struck_by branch, storage condition, missing end stops',
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('struck_by'),
      principal_body_part: c('shoulder'),
      employee_role: c('warehouse associate'),
      discovery_mode: c('witnessed'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Picking bar stock from the third level of the material rack in stores',
      task_stage: c('transport'),
      task_purpose: c('routine'),

      procedure_reference: 'SW-077 Material Rack Picking',
      procedure_followed: c('as_written'),
      ppe_in_use: m('safety glasses', 'steel toe boots', 'cut resistant gloves'),
      ppe_specified: c('yes'),

      equipment_identifier: 'Material rack MR-11 in the stores area, third level',
      equipment_state: m('at_rest', 'loaded'),
      equipment_condition: c('known_fault'),
      equipment_condition_detail:
        'The rack has no end stops fitted on the third level, noted at the last rack inspection',
      object_weight: c('25_50'),
      object_size: m('long'),
      grip_method: m('two_hands'),

      sequence_before:
        'Standing square to the rack at the third level with both hands on a length of bar stock at about chest height, drawing it toward the body',
      posture_at_event: c('reaching_forward'),
      sequence_moment:
        'The adjacent length rolled sideways as the first was withdrawn, travelled off the open end of the rack, and fell onto the left shoulder from the level above',
      sequence_after:
        'The bar landed on the floor, the associate stepped back holding the left shoulder, and a coworker at the next aisle called the supervisor',

      mech_struck_moving:
        'A 6 foot length of steel bar stock rolled off the open end of the third rack level and fell onto the left shoulder, which was stationary',
      mech_struck_distance: c('1_3'),
      mech_struck_weight: c('25_50'),
      point_of_contact: 'Top of the left shoulder',
      force_direction: c('from_above'),

      cond_difference_from_normal:
        'The third level had been loaded with mixed lengths that morning rather than the usual single size, so the lengths did not sit tight together',
      cond_environment_factors: m('poor or glaring lighting'),
      cond_environment_detail:
        'The stores aisle is lit from the main bay and the upper rack levels sit in shadow',
      ...timing('the first half of the shift', 'no_overtime', 'the first few minutes'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'The missing end stops on rack MR-11 were raised at the last rack inspection and the action to fit them is still open',
      cond_barriers_bypassed: c('yes'),
      cond_barriers_detail:
        'End stops are the specified control for preventing material rolling off the rack and none are fitted on the third level',
      cond_stop_work:
        'The pick could have been stopped once the mixed lengths were seen, but loading mixed lengths is common and was not treated as a hazard',

      resp_first_aid: m('a cold pack was applied'),
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the supervisor', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the area was barriered off'),
      resp_work_status: c('stopped'),
    },
  },

  {
    id: 'repetitive-wrist',
    title: 'Repetitive motion wrist symptoms',
    covers: 'gradual branch with repetitive mechanism, escape hatch in use',
    answers: {
      onset_pattern: c('gradual'),
      injury_or_illness: c('illness'),
      accident_type: c('repetitive_motion'),
      principal_body_part: c('wrist'),
      employee_role: c('assembler'),
      discovery_mode: c('self_reported_delayed'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Seating connector housings into the fixture at final assembly station 6',
      task_stage: c('in_process'),
      task_purpose: c('routine'),

      procedure_reference: esc(
        'unknown',
        'The station standard work number is being confirmed by the area lead',
      ),
      procedure_followed: c('as_written'),
      ppe_in_use: m('safety glasses'),
      ppe_specified: c('yes'),

      equipment_identifier: 'Final assembly fixture at station 6',
      equipment_state: m('at_rest'),
      equipment_condition: c('modified'),
      equipment_condition_detail:
        'The fixture was replaced six weeks ago and sits about 4 inches further forward',
      object_weight: c('under_10'),
      object_size: m('small_one_hand'),
      grip_method: m('pinch_grip', 'bare_hand'),

      gradual_task_frequency: c('several hundred times per shift'),
      gradual_duration_at_task: c('six months to two years'),
      gradual_cycle_description:
        'Reach forward about 20 inches into the bin, grasp the housing in a pinch grip, rotate the right wrist to line it up with the fixture, press down with the heel of the hand to seat it, then release and return',
      posture_task: c('reaching_forward'),
      gradual_force: c('moderate force'),

      gradual_symptom_onset:
        'Aching and tingling in the right wrist first noticed about eight weeks ago, at first only in the last hour of a shift',
      gradual_symptom_progression: c('affecting grip or function'),
      gradual_recent_change:
        'The fixture was replaced about six weeks ago and sits roughly 4 inches further forward, so the reach and the wrist rotation are both greater than before',

      mech_rep_motion:
        'Right wrist rotation of about 90 degrees with the wrist bent back, combined with a downward press using the heel of the hand',
      mech_rep_frequency: c('several hundred times per shift'),
      mech_rep_force: c('moderate force'),

      cond_difference_from_normal:
        'The fixture change six weeks ago increased the reach and the wrist rotation, and the station has not been reassessed since',
      cond_environment_factors: m('nothing notable'),
      ...timing('the second half of the shift', 'overtime_today', 'several hours in'),
      cond_known_hazard: c('unknown'),
      cond_barriers_bypassed: c('no'),
      cond_stop_work: esc(
        'not_applicable',
        'There was no single event at which work could have been stopped',
      ),

      resp_first_aid: m('no first aid was given at the scene'),
      resp_provider_role: c('none'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('at the end of the shift'),
      resp_delay_reason:
        'The tingling was mild at first and was expected to settle, and reporting it would have meant stopping the line',
      resp_scene: m('nothing was secured'),
      resp_work_status: c('modified'),
    },
  },

  {
    id: 'delayed-report-back',
    title: 'Delayed report of a back injury',
    covers: 'delayed reporting path, reporting friction as a finding',
    answers: {
      onset_pattern: c('acute'),
      injury_or_illness: c('injury'),
      accident_type: c('overexertion'),
      principal_body_part: c('back_lower'),
      employee_role: c('forklift operator'),
      discovery_mode: c('self_reported_delayed'),
      equipment_involved: true,
      object_handled: true,

      task_performed: 'Restacking fallen cartons from a damaged pallet in the shipping bay by hand',
      task_stage: c('transport'),
      task_purpose: c('behind_schedule'),

      procedure_reference: 'SW-140 Manual Restacking of Damaged Pallets',
      procedure_followed: c('differed'),
      procedure_deviation:
        'The written method calls for two people to restack a damaged pallet, but only one operator was in the bay at that hour and the trailer was due out',
      ppe_in_use: m('safety glasses', 'steel toe boots', 'general purpose gloves'),
      ppe_specified: c('yes'),

      equipment_identifier: 'A damaged wooden pallet and cartons in the shipping bay',
      equipment_state: m('at_rest'),
      equipment_condition: c('damaged'),
      equipment_condition_detail:
        'The pallet had a broken top board which is why the load had shifted',
      object_weight: c('25_50'),
      object_size: m('bulky', 'no_handholds'),
      grip_method: m('two_hands', 'underneath', 'against_body'),

      sequence_before:
        'Squatting beside the damaged pallet with a carton at floor level, back turned toward the stack it was going onto',
      posture_at_event: c('bent_and_twisted'),
      sequence_moment:
        'The carton was raised to about chest height and the torso twisted to the right to place it on the stack behind, at which point a sharp pain was felt across the lower back',
      sequence_after:
        'The carton was placed on the stack, the operator straightened up slowly and continued restacking more carefully, and the trailer was loaded on time',

      mech_exert_weight: c('25_50'),
      mech_exert_from: c('floor'),
      mech_exert_to: c('chest'),
      mech_exert_reach: c('at about arm reach'),
      mech_exert_assist: c('no assist device exists for this task'),
      mech_exert_team: c('one_person'),
      point_of_contact: 'Lower back on the right side',
      force_direction: c('from_in_front'),

      cond_difference_from_normal:
        'The written method requires two people for a damaged pallet and only one operator was in the bay at that hour',
      cond_environment_factors: m('time or production pressure'),
      cond_environment_detail:
        'The trailer was booked out within the hour and the bay was otherwise empty',
      cond_time_into_shift: c('beyond the scheduled shift end'),
      cond_overtime: c('consecutive_overtime'),
      cond_time_into_task: c('roughly half an hour in'),
      cond_first_time: c('no'),
      cond_known_hazard: c('no'),
      cond_barriers_bypassed: c('no'),
      cond_stop_work:
        'The restack could have waited for a second person, but that would have meant missing the trailer departure and no cover was available',

      resp_first_aid: m('no first aid was given at the scene'),
      resp_provider_role: c('none'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the supervisor'),
      resp_elapsed: c('the following day or later'),
      resp_delay_reason:
        'The pain was mild at the time and was expected to settle overnight, and the trailer still had to be loaded. It was worse the following morning',
      resp_scene: m('nothing was secured'),
      resp_work_status: c('continued'),
    },
  },

  {
    id: 'aggravation-prior-condition',
    title: 'Aggravation of a prior shoulder condition',
    covers: 'aggravation branch, prior condition context and change',
    answers: {
      onset_pattern: c('aggravation'),
      injury_or_illness: c('injury'),
      accident_type: c('overexertion'),
      principal_body_part: c('shoulder'),
      employee_role: c('machinist'),
      discovery_mode: c('self_reported_immediate'),
      equipment_involved: true,
      object_handled: false,

      task_performed:
        'Freeing a seized clamping lever on the vertical mill at the start of a setup',
      task_stage: c('setup'),
      task_purpose: c('fault'),

      procedure_reference: 'SW-612 Vertical Mill Fixture Changeover',
      procedure_followed: c('differed'),
      procedure_deviation:
        'The written method says a seized lever is reported to maintenance rather than freed by hand, but the job was due to run that shift so it was pulled by hand first',
      ppe_in_use: m('safety glasses', 'general purpose gloves'),
      ppe_specified: c('yes'),

      equipment_identifier: 'Vertical mill VM-07, fixture clamping lever',
      equipment_state: m('de_energized', 'at_rest'),
      equipment_condition: c('known_fault'),
      equipment_condition_detail:
        'The clamping lever has been stiff for several weeks and is on the maintenance backlog',

      sequence_before:
        'Standing square to the mill with the right hand on the clamping lever at about shoulder height and the left hand braced on the machine table',
      posture_at_event: c('standing_upright'),
      sequence_moment:
        'A hard pull was applied to the lever, the lever gave suddenly and the right arm travelled back and up past shoulder height, at which point a sharp pain was felt in the front of the right shoulder',
      sequence_after:
        'The machinist let go of the lever, stepped back from the mill holding the right arm against the body, and called the team lead',

      prior_condition_source: c('prior_work_case'),
      prior_condition_change:
        'The previously repaired right shoulder had full range of motion and no symptoms before this. After the lever gave, the arm could not be raised above shoulder height and the pain has been constant since',

      mech_exert_weight: c('no_discrete_weight'),
      mech_exert_from: c('shoulder'),
      mech_exert_to: c('overhead'),
      mech_exert_reach: c('at full extended reach'),
      mech_exert_assist: c('an assist device was available but not used'),
      mech_exert_team: c('not_a_lift'),
      point_of_contact: 'Front of the right shoulder',
      force_direction: c('from_behind'),

      cond_difference_from_normal:
        'The lever had been stiff for weeks but gave suddenly on this occasion rather than freeing gradually',
      cond_environment_factors: m('nothing notable'),
      ...timing('the first hour of the shift', 'no_overtime', 'the first few minutes'),
      cond_known_hazard: c('yes'),
      cond_known_hazard_detail:
        'The stiff clamping lever on VM-07 has been on the maintenance backlog for about six weeks and a work order is open',
      cond_barriers_bypassed: c('no'),
      cond_stop_work:
        'The lever could have been reported to maintenance as the written method requires, but the job was due to run that shift and the wait was expected to be long',

      resp_first_aid: m('a cold pack was applied'),
      resp_provider_role: c('first_aid_responder'),
      resp_evaluation: c('offsite_clinic'),
      resp_notified: m('the team lead', 'EHS'),
      resp_elapsed: c('within a few minutes'),
      resp_scene: m('the equipment was stopped'),
      resp_work_status: c('stopped'),
    },
  },
];

export function scenarioById(id: string): Scenario {
  const found = scenarios.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}
