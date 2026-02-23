#!/usr/bin/env node

/**
 * Retroactive Migration Script
 *
 * This script adds trip owners as companions to all items within their trips.
 * It ensures that existing items created before the auto-add feature was implemented
 * now have the trip owner listed as a companion.
 *
 * Usage: node scripts/retroactive-add-trip-owners.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../models');

async function runMigration() {
  try {
    // Get all trips with their user information
    const trips = await db.Trip.findAll({
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email'],
        },
      ],
    });

    let totalItemsProcessed = 0;
    let totalCompanionsAdded = 0;

    for (const trip of trips) {
      // Check if trip owner already has a TravelCompanion record
      let ownerCompanion = await db.TravelCompanion.findOne({
        where: { userId: trip.user.id },
      });

      if (!ownerCompanion) {
        ownerCompanion = await db.TravelCompanion.create({
          name: `${trip.user.firstName} ${trip.user.lastName}`,
          email: trip.user.email,
          userId: trip.user.id,
          createdBy: trip.user.id,
        });
      }

      // Check if trip owner is already linked via TripCompanion
      const tripCompanionLink = await db.TripCompanion.findOne({
        where: {
          tripId: trip.id,
          companionId: ownerCompanion.id,
        },
      });

      if (!tripCompanionLink) {
        await db.TripCompanion.create({
          tripId: trip.id,
          companionId: ownerCompanion.id,
          canAddItems: true,
          permissionSource: 'owner',
          addedBy: trip.user.id,
        });
      }

      // Get all items for this trip
      const flights = await db.Flight.findAll({ where: { tripId: trip.id } });
      const hotels = await db.Hotel.findAll({ where: { tripId: trip.id } });
      const transportation = await db.Transportation.findAll({ where: { tripId: trip.id } });
      const carRentals = await db.CarRental.findAll({ where: { tripId: trip.id } });
      const events = await db.Event.findAll({ where: { tripId: trip.id } });

      const items = [
        ...flights.map((f) => ({ type: 'flight', id: f.id })),
        ...hotels.map((h) => ({ type: 'hotel', id: h.id })),
        ...transportation.map((t) => ({ type: 'transportation', id: t.id })),
        ...carRentals.map((cr) => ({ type: 'car_rental', id: cr.id })),
        ...events.map((e) => ({ type: 'event', id: e.id })),
      ];

      // For each item, check if trip owner is already a companion
      for (const item of items) {
        const existingCompanion = await db.ItemCompanion.findOne({
          where: {
            itemType: item.type,
            itemId: item.id,
            companionId: ownerCompanion.id,
          },
        });

        if (!existingCompanion) {
          await db.ItemCompanion.create({
            itemType: item.type,
            itemId: item.id,
            companionId: ownerCompanion.id,
            status: 'attending',
            addedBy: trip.user.id,
            inheritedFromTrip: true,
          });
          totalCompanionsAdded++;
        }

        totalItemsProcessed++;
      }
    }

    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

runMigration();
