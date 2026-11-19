-- Accept the Daily Deck illustration IDs while retaining every existing ID.
begin;
alter table public.daily_deck_items
    drop constraint daily_deck_items_icon_check,
    add constraint daily_deck_items_icon_check check (icon in (
        'neutral','walk','read','water','focus','stretch','journal','meditate','exercise',
        'water-plants','cook','groceries','call','tidy','sleep','learn'
    ));
alter table public.daily_deck_occurrences
    drop constraint daily_deck_occurrences_icon_check,
    add constraint daily_deck_occurrences_icon_check check (icon in (
        'neutral','walk','read','water','focus','stretch','journal','meditate','exercise',
        'water-plants','cook','groceries','call','tidy','sleep','learn'
    ));
alter table public.daily_deck_appearance_versions
    drop constraint daily_deck_appearance_versions_icon_check,
    add constraint daily_deck_appearance_versions_icon_check check (icon in (
        'neutral','walk','read','water','focus','stretch','journal','meditate','exercise',
        'water-plants','cook','groceries','call','tidy','sleep','learn'
    ));
commit;
