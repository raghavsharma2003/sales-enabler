-- Blueprint decision 9's alert: when a script is slowed (script_throttle, by learning's harm lane or calls' catastrophic-
-- line lane), every active notification destination that listens for 'script.slowed' gets a delivery at once. It goes
-- straight to notification_delivery, not through webhook_outbox: it is an alert for the team, not a results-out event,
-- so no customer webhook endpoint (even one on '*') receives it. Ids and codes only; the words are made when it is sent.
CREATE FUNCTION notify_script_slowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_delivery (workspace_id, destination_id, event, data)
    SELECT NEW.workspace_id, d.id, 'script.slowed', jsonb_build_object('throttleId', NEW.id, 'versionId', NEW.agent_version_id,
      'agentId', NEW.agent_id, 'signal', NEW.detail->>'signal', 'factor', NEW.factor)
    FROM notification_destination d WHERE d.workspace_id = NEW.workspace_id AND d.status = 'active' AND 'script.slowed' = ANY(d.events);
  IF FOUND THEN PERFORM pg_notify('vp_outbox', NEW.workspace_id::text); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER script_throttle_alert AFTER INSERT ON script_throttle FOR EACH ROW EXECUTE FUNCTION notify_script_slowed();
