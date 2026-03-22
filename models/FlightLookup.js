module.exports = (sequelize, DataTypes) => {
  const FlightLookup = sequelize.define(
    'FlightLookup',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      flightIata: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      flightDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      // Departure
      depAirportName: DataTypes.STRING,
      depIata: DataTypes.STRING(4),
      depIcao: DataTypes.STRING(5),
      depTimezone: DataTypes.STRING,
      depTerminal: DataTypes.STRING,
      depGate: DataTypes.STRING,
      depScheduled: DataTypes.STRING,
      depEstimated: DataTypes.STRING,
      depActual: DataTypes.STRING,
      depDelay: DataTypes.INTEGER,
      // Arrival
      arrAirportName: DataTypes.STRING,
      arrIata: DataTypes.STRING(4),
      arrIcao: DataTypes.STRING(5),
      arrTimezone: DataTypes.STRING,
      arrTerminal: DataTypes.STRING,
      arrGate: DataTypes.STRING,
      arrScheduled: DataTypes.STRING,
      arrEstimated: DataTypes.STRING,
      arrActual: DataTypes.STRING,
      arrDelay: DataTypes.INTEGER,
      arrBaggage: DataTypes.STRING,
      // Airline
      airlineName: DataTypes.STRING,
      airlineIata: DataTypes.STRING(3),
      airlineIcao: DataTypes.STRING(4),
      // Flight meta
      flightNumber: DataTypes.STRING,
      flightIcao: DataTypes.STRING,
      flightStatus: DataTypes.STRING,
      // Aircraft
      aircraftRegistration: DataTypes.STRING,
      aircraftIata: DataTypes.STRING,
      aircraftIcao: DataTypes.STRING,
      // Metadata
      apiLastFetched: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: 'flight_lookups',
      timestamps: true,
      indexes: [
        {
          name: 'idx_flight_lookups_iata_date',
          fields: ['flightIata', 'flightDate'],
          unique: true,
        },
      ],
    }
  );

  FlightLookup.associate = (models) => {
    FlightLookup.hasMany(models.Flight, {
      foreignKey: 'flightLookupId',
      as: 'linkedFlights',
      constraints: false,
    });
  };

  return FlightLookup;
};
