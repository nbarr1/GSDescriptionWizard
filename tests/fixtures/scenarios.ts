/**
 * Twelve complete synthetic sessions spanning the branch matrix.
 *
 * These are the regression benchmark. Each one is a plausible case an EHS
 * reporter could actually file, written the way a reasonably diligent user
 * would write it - not the way a perfect user would.
 *
 * Several fixtures deliberately carry seeded problems (a name, a badge number,
 * an apostrophe, a pronoun) so the guards have something to catch.
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

const choice = (value: string): AnswerValue => ({ kind: 'choice', value });
const multi = (...values: string[]): AnswerValue => ({ kind: 'multi', values });
const escape = (hatch: 'unknown' | 'not_applicable', justification: string): AnswerValue => ({
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

// Shared answers that every scenario needs but that carry no branch meaning.
const commonResponse = {
  resp_scene: 'The station was left as it was and the area supervisor attended before work resumed',
  resp_work_status: choice('stopped'),
};

export const scenarios: Scenario[] = [
  // -------------------------------------------------------------------------
  {
    id: 'laceration-hand-tool',
    title: 'Acute laceration with a hand tool',
    covers: 'struck_against branch, equipment detail, seeded apostrophe and pronoun',
    seededPii: ['he'],
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('struck_against'),
      principal_body_part: choice('finger'),
      employee_role: choice('assembler'),
      equipment_involved: true,
      discovery_mode: choice('witnessed'),

      task_performed: 'Opening a shrink wrapped bundle of cartons on the packing bench',
      task_purpose: 'The bundle was needed to keep the packing line running through the shift',
      task_stage: choice('in_process'),
      procedure_reference: 'No written procedure exists for this task',
      procedure_followed: choice('none_exists'),
      equipment_identifier: 'Utility knife with a retractable blade, issued from the tool crib',
      equipment_state: multi('at_rest'),
      equipment_condition:
        "The blade hadn't been changed for several weeks and was noted as dull by the packer",
      object_handled: true,
      object_weight: 'Approximately 12 pounds for the bundle',
      object_dimensions: 'About 24 by 16 by 10 inches, wrapped tight with no hand holds',
      grip_method:
        'The bundle was steadied with the left hand while he drew the knife toward the body with the right hand',
      ppe_in_use: 'Safety glasses and cut level A2 gloves',
      ppe_specified: choice('no'),

      sequence_before:
        'Standing at the packing bench with the bundle at waist height, left hand flat on the top of the bundle and the right hand holding the knife about 6 inches away',
      sequence_moment:
        'The blade cut through the wrap sooner than expected, the knife continued travelling toward the body, and it contacted the left index finger which was resting on the wrap',
      sequence_after:
        'The knife was set down on the bench, the cut was covered with the right hand, and the team lead was called over from the next station',

      mech_struck_moving:
        'The knife blade was moving toward the body and the left index finger was stationary on the bundle',
      mech_struck_direction: 'Toward the body over a travel of about 6 inches',
      mech_struck_force: 'Light hand force, but the blade was drawn rather than pushed',

      point_of_contact:
        'Across the palm side of the left index finger at the middle joint, with the blade travelling toward the thumb side',

      cond_difference_from_normal:
        'The dull blade needed more force than usual, which is why the cut released suddenly',
      cond_environment_factors: multi('time_pressure'),
      cond_environment_detail:
        'The packing line was running behind and cartons were being opened faster than normal',
      cond_time_factors: 'About 5 hours into an 8 hour shift and roughly 2 minutes into this task',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'Cutting toward the body has been raised at two toolbox talks and safety knives were requested for the packing bench about three months ago',
      cond_barriers_bypassed: choice('yes'),
      cond_barriers_detail:
        'A self retracting safety knife is the specified control for this bench but none were available in the tool crib',
      cond_stop_work:
        'The employee could have waited for a safety knife to be issued, but that would have stopped the packing line for an unknown period',

      resp_first_aid:
        'The wound was rinsed at the sink and a sterile dressing with pressure was applied in the first aid room',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification:
        'The team lead was told immediately and EHS was notified within about ten minutes',
      ...commonResponse,
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'overexertion-two-person-lift',
    title: 'Overexertion during a two-person lift',
    covers: 'overexertion branch, team lift detail, assist device not used',
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('overexertion'),
      principal_body_part: choice('back_lower'),
      employee_role: choice('material handler'),
      equipment_involved: true,
      discovery_mode: choice('witnessed'),

      task_performed: 'Moving a pump casing from a floor pallet onto the maintenance bench',
      task_purpose: 'The casing was needed for a scheduled rebuild that morning',
      task_stage: choice('transport'),
      procedure_reference: 'SW-221 Manual Handling of Rotating Equipment',
      procedure_followed: choice('differed'),
      procedure_deviation:
        'The written method calls for the overhead hoist to be used for anything above 50 pounds, but the hoist was tagged out for inspection so the casing was lifted by hand',
      equipment_identifier: 'Pump casing from unit P-118, and the maintenance bench in bay 3',
      equipment_state: multi('at_rest'),
      equipment_condition: 'Normal condition with no open maintenance items on either item',
      object_handled: true,
      object_weight: 'Approximately 95 pounds',
      object_dimensions: 'About 22 inches across and 14 inches deep, round with no hand holds',
      grip_method:
        'Gripped underneath the flange with both hands, one handler at each side, wearing general purpose gloves',
      ppe_in_use: 'Safety glasses, steel toe boots and general purpose gloves',
      ppe_specified: choice('yes'),

      sequence_before:
        'Squatting at the near side of the pallet with the casing at floor level, feet apart and the second handler squatting opposite',
      sequence_moment:
        'The lift was called and both handlers raised the casing to about knee height, the far side was raised faster, the casing tilted toward the near handler, and the near handler twisted to the left to keep hold of it',
      sequence_after:
        'The casing was lowered back onto the pallet, the near handler remained standing and reported pain across the lower back, and the lift was abandoned',

      mech_exert_weight: 'Approximately 95 pounds shared between two handlers',
      mech_exert_heights: 'From floor level to about knee height before the lift was abandoned',
      mech_exert_posture:
        'The load was held at about 20 inches in front of the body with the back bent forward, and the torso twisted to the left as the casing tilted',
      mech_exert_assist:
        'The overhead hoist is the specified aid and was available in the bay but was tagged out for inspection that morning',
      mech_exert_team: choice('two_person'),
      mech_exert_team_detail:
        'The lift was called by the far handler, the far side was raised roughly a second early, and the load tipped toward the near handler',

      point_of_contact:
        'Across the lower back on the left side, with the load pulling forward and to the left',

      cond_difference_from_normal:
        'The hoist is normally used for this transfer and had been tagged out since the start of the shift',
      cond_environment_factors: multi('congestion'),
      cond_environment_detail:
        'The bay was congested with parts staged for the rebuild, so the handlers could not stand square to the pallet',
      cond_time_factors: 'About 2 hours into an 8 hour shift and roughly 5 minutes into this task',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'Risk assessment RA-118 covers manual handling of pump components and identifies loads above 50 pounds as requiring mechanical assistance',
      cond_barriers_bypassed: choice('no'),
      cond_stop_work:
        'The rebuild could have waited for the hoist inspection to finish, but the unit was needed back in service the same day',

      resp_first_aid: 'A cold pack was applied to the lower back in the first aid room for about 20 minutes',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification: 'The supervisor was told within about two minutes and EHS within the hour',
      ...commonResponse,
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'slip-wet-floor',
    title: 'Slip on a wet floor',
    covers: 'fall_same_level branch, environmental conditions, seeded badge number',
    seededPii: ['badge 448192'],
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('fall_same_level'),
      principal_body_part: choice('hip'),
      employee_role: choice('quality inspector'),
      equipment_involved: false,
      discovery_mode: choice('witnessed'),

      task_performed: 'Walking from the inspection bench to the parts washer carrying a tote of samples',
      task_purpose: 'The samples were being taken for a scheduled cleanliness check',
      task_stage: choice('walking'),
      procedure_reference: 'No written procedure exists for walking between these areas',
      procedure_followed: choice('none_exists'),
      object_handled: true,
      object_weight: 'Approximately 15 pounds',
      object_dimensions: 'A tote about 18 by 12 by 8 inches, carried level in both arms',
      grip_method: 'Carried in both arms against the chest, which blocked the view of the floor ahead',
      ppe_in_use: 'Safety glasses and steel toe boots',
      ppe_specified: choice('yes'),

      sequence_before:
        'Walking at normal pace along the main aisle with the tote held in both arms at chest height, looking ahead rather than down at the floor',
      sequence_moment:
        'The right foot contacted a patch of coolant on the aisle floor, the foot slid forward, balance was lost backwards, and the fall was taken onto the right hip and the outstretched right hand',
      sequence_after:
        'The tote was dropped and the samples scattered, the inspector remained on the floor for about a minute, and a passing operator called the team lead',

      mech_fall_surface:
        'Sealed concrete aisle floor with a patch of coolant about 18 inches across, not marked or barriered at the time',
      mech_fall_foot_contact:
        'The right foot slid forward on the coolant, balance was lost backwards, and the fall was taken onto the right hip and the outstretched right hand',
      mech_fall_footwear: 'Site issued slip resistant safety boots, soles worn smooth at the heel',
      mech_fall_carried: 'A tote of samples held in both arms, obscuring the view of the floor ahead',

      point_of_contact:
        'The right hip contacted the floor first with the force directed upward through the hip, followed by the outstretched right hand',

      cond_difference_from_normal:
        'The coolant patch was new. Badge 448192 reported the same leak from the adjacent machine earlier in the shift',
      cond_environment_factors: multi('floor_wet', 'lighting_poor'),
      cond_environment_detail:
        'The aisle light above this section has been out for about two weeks and the area is lit by spill light from the next bay',
      cond_time_factors: 'About 7 hours into a 12 hour shift and roughly 30 seconds into this walk',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'A coolant leak on the adjacent machine was raised as a near miss about two weeks ago and the corrective action to reseal the housing is still open',
      cond_barriers_bypassed: choice('yes'),
      cond_barriers_detail:
        'Spill absorbent and cones are kept at the end of the aisle but the spill had not been marked or contained when it was first seen',
      cond_stop_work:
        'The leak could have been reported and the aisle coned when it was first noticed earlier in the shift, but it was treated as a routine drip',

      resp_first_aid: 'A cold pack was applied to the right hip in the first aid room for about 15 minutes',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification: 'The team lead attended within about a minute and EHS was notified within ten minutes',
      resp_scene: 'The aisle was coned and the coolant was absorbed before the area was reopened',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'caught-in-guard-removal',
    title: 'Caught in during guard removal',
    covers: 'caught_in_between branch, bypassed interlock, open corrective action',
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('caught_in_between'),
      principal_body_part: choice('hand'),
      employee_role: choice('operator'),
      equipment_involved: true,
      discovery_mode: choice('witnessed'),

      task_performed: 'Clearing a jammed carton from the infeed conveyor at station 4',
      task_purpose:
        'The line had stopped on a jam alarm and the shift was about two hours behind the build plan',
      task_stage: choice('troubleshooting'),
      procedure_reference: 'SW-114 Conveyor Jam Clearing rev C',
      procedure_followed: choice('differed'),
      procedure_deviation:
        'The written method requires the belt to be stopped and locked out before the guard opening is reached through, but the interlock was bypassed with a spare key because a full stop needs a restart sequence taking about fifteen minutes',
      equipment_identifier: 'Infeed conveyor CV-04 at station 4',
      equipment_state: multi('energized', 'moving', 'guard_removed'),
      equipment_condition:
        'The guard latch has been sticking for about a month and is on the maintenance backlog',
      object_handled: false,
      ppe_in_use: 'Safety glasses and cut resistant gloves, no sleeve protection',
      ppe_specified: choice('yes'),

      sequence_before:
        'Standing on the operator side of the conveyor, leaning over the side rail with the right arm extended into the guard opening and the left hand braced on the rail',
      sequence_moment:
        'The carton released suddenly, the belt restarted under its own control logic, and the right hand was drawn against the fixed steel edge of the guard opening',
      sequence_after:
        'A coworker hit the station e-stop after about three seconds, the hand was withdrawn, and the line was left stopped until the supervisor arrived',

      mech_caught_surfaces: 'Between the moving conveyor belt and the fixed steel edge of the guard opening',
      mech_caught_entry:
        'The right hand was reaching through a 5 inch service gap in the guard to free the jammed carton without stopping the belt',
      mech_caught_release: 'The belt was stopped by a coworker at the station e-stop after about three seconds',

      point_of_contact:
        'Across the back of the right hand at the base of the index and middle fingers, with force applied from the little finger side toward the thumb',

      cond_difference_from_normal:
        'The jam occurred three times that shift where it normally happens about once a week, and the line had been running cartons from a new supplier since Monday',
      cond_environment_factors: multi('time_pressure', 'noise_high'),
      cond_environment_detail:
        'The line was behind the build plan and the noise at the station makes it hard to hear the belt restart',
      cond_time_factors:
        'About 7 hours into a 12 hour shift, the third consecutive day of overtime, and roughly 20 seconds into this task',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'A near miss was raised about four months ago for reaching into the same guard opening, and the corrective action to fit a fixed shield is still open',
      cond_barriers_bypassed: choice('yes'),
      cond_barriers_detail:
        'The interlock on the access door had been bypassed with a spare key kept at the station, and the guard has a 5 inch service opening that allows a hand to reach the belt while it is running',
      cond_stop_work:
        'The belt could have been stopped and locked out to clear the jam, but a full stop requires a restart sequence taking about fifteen minutes and the line was already behind the plan',

      resp_first_aid:
        'The hand was rinsed at the sink and a sterile dressing was applied in the first aid room',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification:
        'The team lead was called from the station intercom within about two minutes and EHS was notified roughly twenty minutes later',
      resp_scene: 'The conveyor was stopped and locked out and the station was barriered off until EHS attended',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('emergency_room'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'gradual-shoulder-strain',
    title: 'Gradual onset shoulder strain',
    covers: 'gradual branch, cumulative exposure, recent change in the work',
    answers: {
      onset_pattern: choice('gradual'),
      injury_or_illness: choice('injury'),
      accident_type: choice('repetitive_motion'),
      principal_body_part: choice('shoulder'),
      employee_role: choice('assembler'),
      equipment_involved: true,
      discovery_mode: choice('self_reported_delayed'),

      task_performed: 'Loading trays onto the overhead rack at the sub assembly station',
      task_purpose: 'This is the normal running work at this station for most of the shift',
      task_stage: choice('in_process'),
      procedure_reference: 'SW-402 Sub Assembly Tray Handling',
      procedure_followed: choice('as_written'),
      equipment_identifier: 'Overhead tray rack at sub assembly station 2',
      equipment_state: multi('at_rest'),
      equipment_condition: 'Normal working order with no open maintenance items',
      object_handled: true,
      object_weight: 'Approximately 14 pounds per tray',
      object_dimensions: 'About 24 by 16 by 4 inches, rigid with a lip on each short side',
      grip_method: 'Gripped by the lip at each short side with both hands, wearing general purpose gloves',
      ppe_in_use: 'Safety glasses and general purpose gloves',
      ppe_specified: choice('yes'),

      gradual_task_frequency: 'Approximately 180 trays per shift',
      gradual_duration_at_task: 'About 7 months on this station',
      gradual_cycle_description:
        'Lift a tray from the cart at waist height, raise it with both arms extended to the rack at about shoulder height, push it forward about 18 inches onto the rails, then lower the arms and turn back to the cart',
      gradual_force_posture:
        'About 14 pounds raised with both arms extended forward, with the right elbow above shoulder height through the push onto the rails',
      gradual_symptom_onset:
        'Aching across the front of the right shoulder first noticed about six weeks ago, at first only towards the end of a shift',
      gradual_symptom_progression:
        'Now present through most of the shift and continuing into the evening, and worse during the first hour after each break',
      gradual_recent_change:
        'The rack was raised by about 4 inches during a layout change roughly two months ago, and the tray count per shift went from 140 to 180 at the same time',

      mech_rep_motion:
        'Repeated overhead reach with the right arm raised above shoulder height and the elbow extended through the push onto the rails',
      mech_rep_counts: 'One overhead push per tray, about 180 trays per shift',
      mech_rep_force_posture:
        'About 14 pounds of forward push per tray with the right elbow held above shoulder height throughout the movement',

      cond_difference_from_normal:
        'The rack height and the tray count both changed about two months ago and the station has not been reassessed since',
      cond_environment_factors: multi('none_notable'),
      cond_time_factors:
        'Symptoms are worst in the last three hours of an 8 hour shift, with no overtime worked recently',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('no'),
      cond_barriers_bypassed: choice('no'),
      cond_stop_work:
        'The symptoms could have been reported when they were first noticed six weeks ago, but they were mild and were expected to settle',

      resp_first_aid: 'No first aid was given at the scene because the condition was reported at the end of a shift',
      resp_provider_role: choice('none'),
      resp_notification: 'The team lead was told at the end of the shift and EHS the following morning',
      resp_delay_reason:
        'The aching was mild at first and was expected to settle with rest over the weekend',
      resp_scene: 'Nothing was secured because there was no single event or scene to preserve',
      resp_work_status: choice('modified'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'chemical-splash',
    title: 'Chemical splash to the forearm',
    covers: 'contact_chemical branch, isolation state, seeded name',
    seededPii: ['Michael'],
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('contact_chemical'),
      principal_body_part: choice('arm'),
      employee_role: choice('maintenance technician'),
      equipment_involved: true,
      discovery_mode: choice('witnessed'),

      task_performed: 'Swapping the transfer hose on the parts washer at the quick disconnect fitting',
      task_purpose: 'The hose had been reported as weeping at the fitting on the previous shift',
      task_stage: choice('maintenance'),
      procedure_reference: 'WI-905 Parts Washer Hose Replacement',
      procedure_followed: choice('as_written'),
      equipment_identifier: 'Parts washer PW-02 transfer line at the quick disconnect fitting',
      equipment_state: multi('pressurized', 'hot', 'energized'),
      equipment_condition: 'The fitting had been weeping at the seal for about two shifts and was on the maintenance list',
      object_handled: false,
      ppe_in_use: 'Safety glasses, chemical gloves and a face shield, no sleeve protection',
      ppe_specified: choice('no'),

      sequence_before:
        'Kneeling at the front of the washer with both hands on the quick disconnect and the left forearm resting across the frame about 8 inches below the fitting',
      sequence_moment:
        'The disconnect released under residual pressure and heated wash solution sprayed downward across the inner left forearm between the glove cuff and the sleeve',
      sequence_after:
        'The technician pulled back from the machine, called out to Michael at the next bay, and walked to the emergency shower about 20 feet away',

      mech_energy_source: 'Heated caustic wash solution from the parts washer transfer line at the quick disconnect fitting',
      mech_energy_magnitude: 'Approximately 180 degrees Fahrenheit at roughly 4 percent caustic',
      mech_contact_duration: 'About 2 seconds of spray before the arm was withdrawn, across the inner left forearm',
      mech_isolation_state:
        'The line was drained at the tank but not depressurized at the fitting, and the written method does not require a pressure check before the disconnect is released',

      point_of_contact:
        'Across the inner left forearm from the wrist to about 4 inches below the elbow, sprayed from above and to the left',

      cond_difference_from_normal:
        'The line normally depressurizes on its own overnight, but this swap was done mid shift with the washer still warm',
      cond_environment_factors: multi('congestion', 'temperature_hot'),
      cond_environment_detail:
        'The space in front of the washer is tight and the technician had to kneel with the forearm resting on the frame to reach the fitting',
      cond_time_factors: 'About 3 hours into an 8 hour shift and roughly 10 minutes into this task',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'The weeping fitting had been reported on the previous shift and a work order was open at the time of the event',
      cond_barriers_bypassed: choice('yes'),
      cond_barriers_detail:
        'Sleeve protection is available in the stores but is not listed in the written method for this task, so none was worn',
      cond_stop_work:
        'The swap could have waited until the end of shift when the washer had cooled and the line had depressurized',

      resp_first_aid:
        'The forearm was irrigated at the emergency shower for about 15 minutes and covered with a sterile dressing',
      resp_provider_role: choice('emergency_response_team'),
      resp_notification: 'The supervisor was told within about a minute and EHS attended within five minutes',
      resp_scene: 'The washer was isolated and locked out and the area was barriered until EHS attended',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('emergency_room'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'fall-from-ladder',
    title: 'Fall from a ladder',
    covers: 'fall_elevation branch, fall protection required vs available vs used',
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('fall_elevation'),
      principal_body_part: choice('ankle'),
      employee_role: choice('maintenance technician'),
      equipment_involved: true,
      discovery_mode: choice('witnessed'),

      task_performed: 'Closing an isolation valve on the overhead compressed air line above the assembly cell',
      task_purpose: 'The line was being isolated for a scheduled repair to a leaking fitting downstream',
      task_stage: choice('maintenance'),
      procedure_reference: 'WI-330 Compressed Air Line Isolation',
      procedure_followed: choice('differed'),
      procedure_deviation:
        'The written method calls for the valve to be reached from the mobile platform, but the platform was in use on the other side of the plant so a stepladder was used instead',
      equipment_identifier: 'An 8 foot fiberglass stepladder, asset 20114, and the overhead air line isolation valve',
      equipment_state: multi('at_rest'),
      equipment_condition:
        'The ladder was in serviceable condition with a current inspection tag and no visible damage',
      object_handled: true,
      object_weight: 'A pipe wrench of approximately 4 pounds',
      object_dimensions: 'About 18 inches long, carried in the right hand',
      grip_method: 'Held in the right hand while the left hand was on the ladder rail',
      ppe_in_use: 'Safety glasses, steel toe boots and general purpose gloves',
      ppe_specified: choice('yes'),

      sequence_before:
        'Standing on the third step of the stepladder with the left hand on the rail, the right arm extended up and out to the left toward the valve, and both feet on the same step',
      sequence_moment:
        'The ladder shifted to the left as the reach extended past the side rail, the left foot came off the step, and the fall was taken onto the concrete floor landing on the right foot',
      sequence_after:
        'The wrench was dropped clear, the technician sat on the floor unable to bear weight on the right foot, and a nearby operator called the supervisor',

      mech_fall_height: 'Approximately 3 feet, from the third step of the stepladder to the concrete floor',
      mech_fall_working_surface:
        'An 8 foot fiberglass stepladder set on sealed concrete with one leg resting partly on a cable tray cover, landing on sealed concrete',
      mech_fall_protection:
        'No fall protection is required below 6 feet on this site, none was available at the location, and none was in use',
      mech_fall_initiator: 'The ladder shifted to the left as the reach extended out past the side rail toward the valve',
      mech_fall_footwear: 'Site issued steel toe boots in good condition with the tread intact',
      mech_fall_carried: 'A pipe wrench in the right hand, which left only one hand for the ladder',

      point_of_contact:
        'The right foot contacted the floor first with the ankle rolling outward, force directed upward through the outer ankle',

      cond_difference_from_normal:
        'The mobile platform is normally used for this valve and was unavailable, and the cable tray cover made the ladder footing uneven',
      cond_environment_factors: multi('congestion', 'floor_uneven'),
      cond_environment_detail:
        'The floor under the valve carries a cable tray cover about 2 inches proud, so the ladder could not be set level',
      cond_time_factors: 'About 90 minutes into an 8 hour shift and roughly 5 minutes into this task',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('no'),
      cond_barriers_bypassed: choice('no'),
      cond_stop_work:
        'The job could have waited for the mobile platform to become available, but the repair was scheduled for that morning',

      resp_first_aid: 'The right boot was left on and a cold pack was applied to the ankle while waiting for transport',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification: 'The supervisor attended within about a minute and EHS was notified immediately after',
      resp_scene: 'The ladder was left in place and the area was barriered off until EHS had photographed it',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('emergency_room'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'thermal-burn',
    title: 'Thermal burn from a heated platen',
    covers: 'contact_temperature branch, guard removed for changeover',
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('contact_temperature'),
      principal_body_part: choice('hand'),
      employee_role: choice('operator'),
      equipment_involved: true,
      discovery_mode: choice('self_reported_immediate'),

      task_performed: 'Removing a misfed sheet from the laminating press during a size changeover',
      task_purpose: 'A sheet had misfed at the end of the previous run and had to be cleared before the changeover could finish',
      task_stage: choice('teardown'),
      procedure_reference: 'SW-508 Laminator Changeover',
      procedure_followed: choice('differed'),
      procedure_deviation:
        'The written method requires the platens to cool below 120 degrees Fahrenheit before the press is entered, but the sheet was cleared while the platens were still at running temperature to save about forty minutes of cooling',
      equipment_identifier: 'Laminating press LP-03, upper heated platen',
      equipment_state: multi('hot', 'de_energized', 'guard_removed'),
      equipment_condition: 'Normal working order with no open maintenance items',
      object_handled: true,
      object_weight: 'A laminate sheet of approximately 2 pounds',
      object_dimensions: 'About 40 by 30 inches, thin and flexible',
      grip_method: 'Gripped at the near corner with the right hand, wearing general purpose gloves',
      ppe_in_use: 'Safety glasses and general purpose cotton gloves, not heat resistant',
      ppe_specified: choice('no'),

      sequence_before:
        'Standing at the front of the press with the guard swung open, right arm extended into the press about 18 inches with the hand on the near corner of the sheet',
      sequence_moment:
        'The sheet tore as it was pulled, the right hand travelled forward and the back of the hand contacted the underside of the upper heated platen',
      sequence_after:
        'The hand was withdrawn immediately, the operator stepped back from the press and walked to the sink, and the changeover was stopped',

      mech_energy_source: 'The upper heated platen of laminating press LP-03',
      mech_energy_magnitude: 'Approximately 300 degrees Fahrenheit at the platen surface',
      mech_contact_duration: 'Momentary, less than a second, across the back of the right hand',
      mech_isolation_state:
        'The press was de-energized at the control panel but the platens had not been allowed to cool, and the written method requires cooling below 120 degrees Fahrenheit before entry',

      point_of_contact:
        'Across the back of the right hand between the knuckles and the wrist, contacting a surface above it as the hand travelled forward',

      cond_difference_from_normal:
        'The changeover was being done between shifts rather than at the scheduled slot, so there was no time allowed for the platens to cool',
      cond_environment_factors: multi('temperature_hot', 'time_pressure'),
      cond_environment_detail:
        'The area in front of the press runs warm during a changeover and the crew were working to hand the machine over at shift change',
      cond_time_factors: 'About 7 and a half hours into an 8 hour shift and roughly 15 minutes into the changeover',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'Heat resistant gloves are specified in the risk assessment for this press but are not stocked at the station',
      cond_barriers_bypassed: choice('yes'),
      cond_barriers_detail:
        'The front guard was swung open to reach the sheet, and opening it does not prevent access to the platens while they are hot',
      cond_stop_work:
        'The changeover could have been left for the incoming shift once the platens had cooled, but the handover was already late',

      resp_first_aid: 'The hand was held under cool running water at the sink for about 20 minutes and covered loosely with a sterile dressing',
      resp_provider_role: choice('self'),
      resp_notification: 'The team lead was told within about five minutes and EHS at the end of the shift',
      resp_scene: 'The press was left open to cool and tagged out of service until EHS attended',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'struck-by-dropped-material',
    title: 'Struck by dropped material',
    covers: 'struck_by branch, height and mass, storage condition',
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('struck_by'),
      principal_body_part: choice('shoulder'),
      employee_role: choice('warehouse associate'),
      equipment_involved: true,
      discovery_mode: choice('witnessed'),

      task_performed: 'Picking bar stock from the third level of the material rack in the stores area',
      task_purpose: 'The bar stock was on a pick list for a machining job due that afternoon',
      task_stage: choice('transport'),
      procedure_reference: 'SW-077 Material Rack Picking',
      procedure_followed: choice('as_written'),
      equipment_identifier: 'Material rack MR-11 in the stores area, third level',
      equipment_state: multi('at_rest', 'loaded'),
      equipment_condition:
        'The rack has no end stops fitted on the third level, which was noted at the last rack inspection',
      object_handled: true,
      object_weight: 'Approximately 30 pounds for the length that fell',
      object_dimensions: 'A 6 foot length of 2 inch round bar stock',
      grip_method: 'The adjacent length was being drawn out with both hands at about chest height',
      ppe_in_use: 'Safety glasses, steel toe boots and cut resistant gloves, no hard hat',
      ppe_specified: choice('yes'),

      sequence_before:
        'Standing square to the rack at the third level with both hands on a length of bar stock at about chest height, drawing it toward the body',
      sequence_moment:
        'The adjacent length rolled sideways as the first was withdrawn, travelled off the open end of the rack, and fell onto the left shoulder from the level above',
      sequence_after:
        'The bar landed on the floor, the associate stepped back from the rack holding the left shoulder, and a coworker at the next aisle called the supervisor',

      mech_struck_moving:
        'A 6 foot length of steel bar stock rolled off the open end of the third rack level and fell onto the left shoulder, which was stationary',
      mech_struck_direction: 'From above and slightly behind, falling about 2 feet from the level above',
      mech_struck_force: 'Approximately 30 pounds, falling freely',

      point_of_contact:
        'The top of the left shoulder, struck from directly above with the force directed downward',

      cond_difference_from_normal:
        'The third level had been loaded with mixed lengths that morning rather than the usual single size, so the lengths did not sit tight against each other',
      cond_environment_factors: multi('lighting_poor'),
      cond_environment_detail:
        'The stores aisle is lit from the main bay and the upper rack levels sit in shadow, so a loose length is hard to see from below',
      cond_time_factors: 'About 4 hours into an 8 hour shift and roughly 2 minutes into this pick',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'The missing end stops on rack MR-11 were raised at the last rack inspection and the corrective action to fit them is still open',
      cond_barriers_bypassed: choice('yes'),
      cond_barriers_detail:
        'End stops are the specified control for preventing material rolling off the rack and none are fitted on the third level',
      cond_stop_work:
        'The pick could have been stopped once the mixed lengths were seen, but loading mixed lengths is common and was not treated as a hazard',

      resp_first_aid: 'A cold pack was applied to the left shoulder in the first aid room for about 20 minutes',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification: 'The supervisor attended within about two minutes and EHS within fifteen minutes',
      resp_scene: 'The aisle was barriered and the rack level was unloaded before picking resumed',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'repetitive-wrist',
    title: 'Repetitive motion wrist symptoms',
    covers: 'gradual branch with repetitive_motion mechanism, escape hatch in use',
    answers: {
      onset_pattern: choice('gradual'),
      injury_or_illness: choice('illness'),
      accident_type: choice('repetitive_motion'),
      principal_body_part: choice('wrist'),
      employee_role: choice('assembler'),
      equipment_involved: true,
      discovery_mode: choice('self_reported_delayed'),

      task_performed: 'Seating connector housings into the fixture at final assembly station 6',
      task_purpose: 'This is the normal running work at this station for the whole shift',
      task_stage: choice('in_process'),
      procedure_reference: escape('unknown', 'The station standard work number is being confirmed by the area lead'),
      procedure_followed: choice('as_written'),
      equipment_identifier: 'Final assembly fixture at station 6',
      equipment_state: multi('at_rest'),
      equipment_condition: 'The fixture was replaced about six weeks ago and sits roughly 4 inches further forward than the previous one',
      object_handled: true,
      object_weight: 'Approximately 4 ounces per connector housing',
      object_dimensions: 'About 2 inches square, gripped between the thumb and first two fingers',
      grip_method: 'Pinch grip between the thumb and the first two fingers of the right hand, with a bare hand for feel',
      ppe_in_use: 'Safety glasses only, gloves are not worn at this station because they reduce feel',
      ppe_specified: choice('yes'),

      gradual_task_frequency: 'Approximately 300 units per shift',
      gradual_duration_at_task: 'About 14 months on this station',
      gradual_cycle_description:
        'Reach forward about 20 inches into the bin, grasp the housing in a pinch grip, rotate the right wrist about 90 degrees to line it up with the fixture, press down with the heel of the hand to seat it, then release and return to the bin',
      gradual_force_posture:
        'About 6 pounds of downward press per unit with the right wrist bent back and rotated, held about 20 inches forward of the body',
      gradual_symptom_onset:
        'Aching and tingling in the right wrist first noticed about eight weeks ago, at first only in the last hour of a shift',
      gradual_symptom_progression:
        'Now present through most of the shift and waking the employee at night, and grip strength has dropped when lifting trays at home',
      gradual_recent_change:
        'The fixture was replaced about six weeks ago and sits roughly 4 inches further forward, so the reach and the wrist rotation are both greater than before',

      mech_rep_motion:
        'Right wrist rotation of about 90 degrees with the wrist bent back, combined with a downward press using the heel of the hand',
      mech_rep_counts: 'Four wrist rotations per unit, about 300 units per shift',
      mech_rep_force_posture:
        'About 6 pounds of press force per repetition with the wrist bent back and the arm extended about 20 inches forward',

      cond_difference_from_normal:
        'The fixture change six weeks ago increased the reach and the wrist rotation, and the station has not been reassessed since',
      cond_environment_factors: multi('none_notable'),
      cond_time_factors:
        'Symptoms are worst in the last two hours of an 8 hour shift, with about one overtime shift a week',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('unknown'),
      cond_barriers_bypassed: choice('no'),
      cond_stop_work: escape('not_applicable', 'There was no single event at which work could have been stopped'),

      resp_first_aid: 'No first aid was given because the condition was reported at the end of a shift rather than at the time',
      resp_provider_role: choice('none'),
      resp_notification: 'The team lead was told at the end of the shift and EHS the following morning',
      resp_delay_reason:
        'The tingling was mild at first and was expected to settle, and reporting it would have meant stopping the line',
      resp_scene: 'Nothing was secured because there was no single event or scene to preserve',
      resp_work_status: choice('modified'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'delayed-report-back',
    title: 'Delayed report of a back injury',
    covers: 'delayed reporting path, reporting friction as a finding',
    answers: {
      onset_pattern: choice('acute'),
      injury_or_illness: choice('injury'),
      accident_type: choice('overexertion'),
      principal_body_part: choice('back_lower'),
      employee_role: choice('forklift operator'),
      equipment_involved: true,
      discovery_mode: choice('self_reported_delayed'),

      task_performed: 'Restacking fallen cartons from a damaged pallet in the shipping bay by hand',
      task_purpose: 'A pallet had shifted in transit and had to be restacked before the trailer could be loaded',
      task_stage: choice('transport'),
      procedure_reference: 'SW-140 Manual Restacking of Damaged Pallets',
      procedure_followed: choice('differed'),
      procedure_deviation:
        'The written method calls for two people to restack a damaged pallet, but only one operator was in the bay at that hour and the trailer was due out',
      equipment_identifier: 'A damaged wooden pallet and cartons in the shipping bay',
      equipment_state: multi('at_rest'),
      equipment_condition: 'The pallet had a broken top board which is why the load had shifted',
      object_handled: true,
      object_weight: 'Approximately 45 pounds per carton',
      object_dimensions: 'About 24 inches square with no hand holds',
      grip_method: 'Gripped underneath at opposite corners with both hands and held against the chest',
      ppe_in_use: 'Safety glasses, steel toe boots and general purpose gloves',
      ppe_specified: choice('yes'),

      sequence_before:
        'Squatting beside the damaged pallet with a carton at floor level, back turned toward the stack it was going onto',
      sequence_moment:
        'The carton was raised to about chest height and the torso twisted to the right to place it on the stack behind, at which point a sharp pain was felt across the lower back',
      sequence_after:
        'The carton was placed on the stack, the operator straightened up slowly and continued restacking the remaining cartons more carefully, and the trailer was loaded on time',

      mech_exert_weight: 'Approximately 45 pounds',
      mech_exert_heights: 'From floor level to about chest height',
      mech_exert_posture:
        'The carton was raised at about 16 inches in front of the body with the back bent forward, then the torso twisted to the right without moving the feet',
      mech_exert_assist:
        'A pallet jack and a lift table are available in the bay but neither helps with restacking cartons by hand, so nothing was used',
      mech_exert_team: choice('one_person'),

      point_of_contact: 'Across the lower back on the right side, with the load pulling forward and the torso rotating right',

      cond_difference_from_normal:
        'The written method requires two people for a damaged pallet and only one operator was in the bay at that hour',
      cond_environment_factors: multi('time_pressure'),
      cond_environment_detail: 'The trailer was booked out within the hour and the bay was otherwise empty',
      cond_time_factors:
        'About 10 hours into a 12 hour shift, the second consecutive day of overtime, and roughly 15 minutes into this task',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('no'),
      cond_barriers_bypassed: choice('no'),
      cond_stop_work:
        'The restack could have waited for a second person, but that would have meant missing the trailer departure and no cover was available in the bay',

      resp_first_aid: 'No first aid was given at the time because the pain was not reported until the following morning',
      resp_provider_role: choice('none'),
      resp_notification: 'The supervisor was told at the start of the following shift, about fourteen hours after the event',
      resp_delay_reason:
        'The pain was mild at the time and was expected to settle overnight, and the trailer still had to be loaded. It was worse the following morning',
      resp_scene: 'Nothing was secured because the event was not reported at the time',
      resp_work_status: choice('continued'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 'aggravation-prior-condition',
    title: 'Aggravation of a prior shoulder condition',
    covers: 'aggravation branch, prior condition context and change',
    answers: {
      onset_pattern: choice('aggravation'),
      injury_or_illness: choice('injury'),
      accident_type: choice('overexertion'),
      principal_body_part: choice('shoulder'),
      employee_role: choice('machinist'),
      equipment_involved: true,
      discovery_mode: choice('self_reported_immediate'),

      task_performed: 'Freeing a seized clamping lever on the vertical mill at the start of a setup',
      task_purpose: 'The lever had to be released before the fixture could be changed for the next job',
      task_stage: choice('setup'),
      procedure_reference: 'SW-612 Vertical Mill Fixture Changeover',
      procedure_followed: choice('differed'),
      procedure_deviation:
        'The written method says a seized lever is to be reported to maintenance rather than freed by hand, but the job was due to run that shift so it was pulled by hand first',
      equipment_identifier: 'Vertical mill VM-07, fixture clamping lever',
      equipment_state: multi('de_energized', 'at_rest'),
      equipment_condition: 'The clamping lever has been stiff for several weeks and is on the maintenance backlog',
      object_handled: false,
      ppe_in_use: 'Safety glasses and general purpose gloves',
      ppe_specified: choice('yes'),

      sequence_before:
        'Standing square to the mill with the right hand on the clamping lever at about shoulder height and the left hand braced on the machine table',
      sequence_moment:
        'A hard pull was applied to the lever, the lever gave suddenly and the right arm travelled back and up past shoulder height, at which point a sharp pain was felt in the front of the right shoulder',
      sequence_after:
        'The machinist let go of the lever, stepped back from the mill holding the right arm against the body, and called the team lead from the next machine',

      prior_condition_source: choice('prior_work_case'),
      prior_condition_change:
        'The previously repaired right shoulder had full range of motion and no symptoms before this. After the lever gave, the arm could not be raised above shoulder height and the pain has been constant since',

      mech_exert_weight: 'A hard pull on a lever that had seized, estimated at around 40 pounds of force',
      mech_exert_heights: 'The hand was at about shoulder height throughout and travelled up past it as the lever gave',
      mech_exert_posture:
        'The right arm was extended forward at shoulder height with the body square to the machine, and the arm travelled back and up when the resistance released',
      mech_exert_assist:
        'A lever extension bar is kept at the machine but was not used because the lever was expected to free with hand force',
      mech_exert_team: choice('not_a_lift'),

      point_of_contact:
        'The front of the right shoulder, with the force directed backward and upward as the resistance released suddenly',

      cond_difference_from_normal:
        'The lever had been stiff for weeks but gave suddenly on this occasion rather than freeing gradually',
      cond_environment_factors: multi('none_notable'),
      cond_time_factors: 'About 30 minutes into an 8 hour shift and roughly 3 minutes into the setup',
      cond_first_time: choice('no'),
      cond_known_hazard: choice('yes'),
      cond_known_hazard_detail:
        'The stiff clamping lever on VM-07 has been on the maintenance backlog for about six weeks and a work order is open',
      cond_barriers_bypassed: choice('no'),
      cond_stop_work:
        'The lever could have been reported to maintenance as the written method requires, but the job was due to run that shift and the wait was expected to be long',

      resp_first_aid: 'A cold pack was applied to the front of the right shoulder in the first aid room for about 15 minutes',
      resp_provider_role: choice('first_aid_responder'),
      resp_notification: 'The team lead was told within about a minute and EHS within twenty minutes',
      resp_scene: 'The mill was left as it was and tagged out until maintenance had looked at the lever',
      resp_work_status: choice('stopped'),
      resp_evaluation: choice('offsite_clinic'),
    },
  },
];

export function scenarioById(id: string): Scenario {
  const found = scenarios.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}
