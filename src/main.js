// @ts-check

/**
 * @typedef {object} Atmosphere
 * @property {number} nitrogen
 * @property {number} oxygen
 * @property {number} carbonDioxide
 * @property {number} methane
 * @property {number} waterVapour
 */

/**
 * @typedef {object} Tile
 * @property {number} altitude
 * @property {number} baseLuminosity
 * @property {number} heat
 * @property {TileCover} tileCover
 * @property {Biomass} biomass
 */

/**
 * @typedef {object} Biomass
 * @property {(type: LifeType) => LifePop} getLifePop
 * @property {(localAtmosphere: Atmosphere, worldAtmosphere: Atmosphere, tile: Tile) => void} tick
 * @property {(horizontalTile: Tile, verticalTile: Tile) => void} transfer
 * @property {() => void} abiogenesis
 */

/**
 * @typedef {object} LifePop
 * @property {LifeType} type
 * @property {number} population
 */

/**
 * @typedef {object} World
 * @property {Atmosphere} atmosphere
 * @property {Biomass} biomass
 * @property {Tile[][]} tiles
 * @property {() => void} draw
 * @property {() => void} tick
 * @property {() => void} updateStats
 */

/**@enum {number} */
const TileCover = {
    NotComputed: 0,
    Rock: 1,
    Water: 2,
    Ice: 3,
}


const worldWidth = 100
const worldHeight = 100

const maxAltitude = 5000
const erosionRate = 4
const atmosphereLossRate = 0.01
const atmospherePerTile = 1 / (worldHeight * worldWidth)

const seaLevel = 1000
const freezingPoint = 90
const unlivableTemperature = 180

const volcanoDiameter = 9
const volcanoHalfDiameter = Math.floor(volcanoDiameter / 2)
const volcanoMinUpthrust = 1000
const volcanoUpthrustVariation = 1000

// also measures the energy given to a tile for biological purposes
const fullLuminosityHeat = 60
const polarLuminosity = 0.5
const iceReflectivity = 0.25
const waterReflectivity = 0

// retention value is per unit
const carbonHeatRetention = 0.2
const carbonPerLandTile = 1
const waterVaporHeatRetention = 0.2
const waterVaporPerOceanTile = 1

const photosynthticBiomassPerEnergy = 180
const carbonPerPhotosyntheticBiomass = 0.01
const oxygenPerPhotosyntheticBiomass = 0.01

const planktonAbiogenesisChance = 0.0001
const prokaryoteAbiogenesisMinHeat = 160

/**
 * @typedef {object} LifeType
 * @property {boolean} isPlant
 * @property {boolean} isSentiencePossible
 * @property {boolean} isLandInhabiting
 * @property {boolean} isWaterInhabiting
 * @property {boolean} isFlying
 * @property {number} minTemperature
 * @property {number} maxTemperature
 * @property {number} minAltitude
 * @property {number} maxAltitude
 * @property {number} minBreathableAtmosphere
 * @property {number} reproductionRate
 */

/**
 * @enum {LifeType}
 */
const LifeTypes = {
    Plankton: {
        isPlant: true,
        isSentiencePossible: false,
        isLandInhabiting: false,
        isWaterInhabiting: true,
        isFlying: false,
        minTemperature: freezingPoint,
        maxTemperature: unlivableTemperature,
        minAltitude: 0,
        maxAltitude: seaLevel,
        minBreathableAtmosphere: 0.01,
        reproductionRate: 0.005,
    },
    Kelp: {
        isPlant: true,
        isSentiencePossible: false,
        isLandInhabiting: false,
        isWaterInhabiting: true,
        isFlying: false,
        minTemperature: freezingPoint + 10,
        maxTemperature: unlivableTemperature,
        minAltitude: seaLevel - 500,
        maxAltitude: seaLevel,
        minBreathableAtmosphere: 0.01,
        reproductionRate: 0.005,
    },
    Coral: {
        isPlant: true,
        isSentiencePossible: false,
        isLandInhabiting: false,
        isWaterInhabiting: true,
        isFlying: false,
        minTemperature: unlivableTemperature - 60,
        maxTemperature: unlivableTemperature - 30,
        minAltitude: seaLevel - 100,
        maxAltitude: seaLevel,
        minBreathableAtmosphere: 0.01,
        reproductionRate: 0.005,
    },
    /*Crustacean: {},
    /*Mollusk: {},
    /*Cephalopod: {},*/
}

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
canvas.width = 1000
canvas.height = 1000
const tileSize = 10
const context = canvas.getContext('2d')

/**
 * @param {number} size 
 * @returns {object[]}
 */
function List(size) {
    const result = []
    result.length = size
    return result.fill(undefined)
}

function getRandomX() {
    return Math.floor(Math.random() * worldWidth)
}

function getRandomY() {
    return Math.floor(Math.random() * worldHeight)
}

/**
 * @param {number} r 
 * @param {number} g 
 * @param {number} b 
 * @returns {string}
 */
function rgb(r, g, b) {
    r = Math.floor(r * 256)
    g = Math.floor(g * 256)
    b = Math.floor(b * 256)
    return 'rgb(' + r + ',' + g + ',' + b + ')'
}

/**
 * @param {number} h
 * @param {number} s
 * @param {number} l
 * @returns {string}
 */
function hsl(h, s, l) {
    s = Math.round(s * 100)
    l = Math.round(l * 100)
    return 'hsl(' + h + ',' + s + '%,' + l + '%)'
}

/** @returns {World} */
function World() {
    const atmosphere = Atmosphere()
    const tiles = Tiles()
    const biomass = Biomass(undefined)

    /**@param {(x: number, y: number, tile: Tile) => void} func */
    const applyTiles = function(func) {
        tiles.forEach(function(val, x) {
            val.forEach(function(val, y) {
                func(x, y, val)
            })
        })
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {Tile}
     */
    const getVerticalTile = function(x, y) {
        if (y + 1 != worldHeight) {
            return tiles[x][y + 1]
        }
        else {
            return undefined
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {Tile}
     */
    const getHorizontalTile = function(x, y) {
        return tiles[(x + 1) % worldWidth][y]
    }

    const draw = function() {
        applyTiles(function(x, y, tile) {
            if (tile.tileCover == TileCover.Rock) {
                context.fillStyle = hsl(21, 0.55, tile.altitude / maxAltitude)
            }
            else if (tile.tileCover == TileCover.Water) {
                if (tile.biomass.getLifePop(LifeTypes.Plankton).population == 0) {
                    context.fillStyle = hsl(233, 0.84, 0.45)
                }
                else {
                    context.fillStyle = hsl(117, 0.8, 0.34)
                }
            }
            else if (tile.tileCover == TileCover.Ice) {
                context.fillStyle = hsl(0, 0, 0.9)
            }
            else {
                context.fillStyle = hsl(0, 0, 0)
            }

            context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize)
        })
    }

    const eruptVolcano = function() {
        const baseX = getRandomX()
        const baseY = getRandomY()
        const upthrust = volcanoMinUpthrust + Math.floor(volcanoUpthrustVariation * Math.random())
        const spreadUpthrust = List(volcanoDiameter).map(function(val, x) {
            return List(volcanoDiameter).map(function(val, y) {
                const xDist = volcanoHalfDiameter - x
                const yDist = volcanoHalfDiameter - y
                const dist = Math.sqrt((xDist * xDist) + (yDist * yDist))
                return (Math.max((volcanoHalfDiameter - dist), 0) / volcanoHalfDiameter) * upthrust
            })
        })
        spreadUpthrust.forEach(function(val, xOffset) {
            val.forEach(function(val, yOffset) {
                const x = baseX + xOffset
                const y = baseY + yOffset
                if (x < worldWidth && y < worldHeight) {
                    const tile = tiles[baseX + xOffset][baseY + yOffset]
                    tile.altitude = Math.min(tile.altitude + val, maxAltitude)
                }
            })
        })
    }

    /**
     * @returns {Atmosphere}
     */
    const computeTileAtmosphere = function() {
        return {
            nitrogen: atmosphere.nitrogen * atmospherePerTile,
            oxygen: atmosphere.oxygen * atmospherePerTile,
            carbonDioxide: atmosphere.carbonDioxide * atmospherePerTile,
            methane: atmosphere.methane * atmospherePerTile,
            waterVapour: atmosphere.waterVapour * atmospherePerTile,
        }
    }

    /**
     * @param {Atmosphere} atmosphere
     * @returns {number}
     */
    const computeHeatTrappingFactor = function(atmosphere) {
        return atmosphere.carbonDioxide * carbonHeatRetention + atmosphere.waterVapour * waterVaporHeatRetention
    }

    /**
     * @param {Tile} tile
     * @returns {number}
     */
    const computeLuminosity = function(tile) {
        if (tile.tileCover == TileCover.Water) {
            return tile.baseLuminosity * (1 - waterReflectivity)
        }
        else if (tile.tileCover == TileCover.Ice) {
            return tile.baseLuminosity * (1 - iceReflectivity)
        }
        else {
            return tile.baseLuminosity
        }
    }

    /**
     * @param {Tile} tile
     * @param {number} luminosity
     * @param {number} heatTrappingFactor
     * @returns {number}
     */
    const computeHeat = function(tile, luminosity, heatTrappingFactor) {
        const turnHeat = fullLuminosityHeat * luminosity * (1 + heatTrappingFactor)
        return turnHeat * 0.2 + tile.heat * 0.8
    }

    /**
     * @param {Tile} tile
     * @returns {TileCover}
     */
    const computeTileCover = function(tile) {
        if (tile.altitude < seaLevel) {
            if (tile.heat > freezingPoint) {
                return TileCover.Water
            }
            else {
                return TileCover.Ice
            }
        }
        else {
            return TileCover.Rock
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {Tile} tile
     */
    const transferHeat = function(x, y, tile) {
        const horizontalTile = tiles[(x + 1) % worldWidth][y]
        const horizontalAveHeat = (tile.heat + horizontalTile.heat) / 2
        horizontalTile.heat = horizontalAveHeat
        
        if (y + 1 != worldHeight) {
            const verticalTile = tiles[x][y + 1]
            const verticalAveHeat = (tile.heat + verticalTile.heat) / 2
            verticalTile.heat = verticalAveHeat
            tile.heat = (horizontalAveHeat + verticalAveHeat) / 2
        }
        else {
            tile.heat = horizontalAveHeat
        }
    }

    const tick = function() {
        eruptVolcano()
        atmosphere.carbonDioxide -= atmosphere.carbonDioxide * atmosphereLossRate
        atmosphere.methane -= atmosphere.methane * atmosphereLossRate
        atmosphere.nitrogen -= atmosphere.nitrogen * atmosphereLossRate
        atmosphere.oxygen -= atmosphere.oxygen * atmosphereLossRate
        atmosphere.waterVapour = 0

        const tileAtmosphere = computeTileAtmosphere()
        const heatTrappingFactor = computeHeatTrappingFactor(tileAtmosphere)

        const plankton = biomass.getLifePop(LifeTypes.Plankton)
        plankton.population = 0

        applyTiles(function(x, y, tile) {
            tile.altitude = Math.max(tile.altitude - erosionRate, 0)
            const luminosity = computeLuminosity(tile)
            tile.heat = computeHeat(tile, luminosity, heatTrappingFactor)
            if (tile.tileCover == TileCover.Water) {
                atmosphere.waterVapour += waterVaporPerOceanTile
            }
            else if (tile.tileCover == TileCover.Rock) {
                atmosphere.carbonDioxide += carbonPerLandTile
            }
            
            tile.biomass.abiogenesis()
            tile.biomass.tick(tileAtmosphere, atmosphere, tile)

            const tilePlankton = tile.biomass.getLifePop(LifeTypes.Plankton)
            plankton.population += tilePlankton.population
        })
        applyTiles(function(x, y, tile) {
            transferHeat(x, y, tile)
            tile.biomass.transfer(getHorizontalTile(x, y), getVerticalTile(x, y))
        })
        applyTiles(function(x, y, tile) {
            tile.tileCover = computeTileCover(tile)
        })
    }

    const updateStats = function() {
        document.getElementById('co2').innerText = atmosphere.carbonDioxide.toString()
        document.getElementById('oxygen').innerText = atmosphere.oxygen.toString()
        document.getElementById('watervapour').innerText = atmosphere.waterVapour.toString()
        document.getElementById('avetemp').innerText = (tiles[50].reduce(function(acc, tile) { return acc + tile.heat }, 0) / worldHeight).toString()
        document.getElementById('eqtemp').innerText = (tiles.reduce(function(acc, cur) { return acc + cur[worldHeight / 2].heat }, 0) / worldWidth).toString()
        document.getElementById('poltemp').innerText = (tiles.reduce(function(acc, cur) { return acc + cur[0].heat }, 0) / worldHeight).toString()
        document.getElementById('plankton').innerText = biomass.getLifePop(LifeTypes.Plankton).population.toString()
    }

    return {
        atmosphere: atmosphere,
        tiles: tiles,
        biomass: biomass,
        draw: draw,
        tick: tick,
        updateStats: updateStats,
    }
}

/** @returns {Atmosphere} */
function Atmosphere() {
    return {
        nitrogen: 0,
        oxygen: 0,
        carbonDioxide: 0,
        methane: 0,
        waterVapour: 0,
    }
}

/** @returns {Tile[][]} */
function Tiles() {
    return List(worldWidth).map(function(val, x) {
        return List(worldHeight).map(function(val, y) {
            return Tile(x, y)
        })
    })
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {Tile}
 */
function Tile(x, y) {
    const equatorialDistance = Math.abs(y - (worldHeight / 2)) / (worldHeight / 2)
    /**@type {Tile} */
    const tile = {
        altitude: 0,
        baseLuminosity: 1 - ((1 - polarLuminosity) * equatorialDistance),
        heat: 0,
        tileCover: TileCover.NotComputed,
        biomass: undefined,
    }
    tile.biomass = Biomass(tile)
    return tile
}

/**
 * @param {Tile} tile
 * @returns {Biomass}
 */
function Biomass(tile) {
    /**@type {LifePop[]} */
    const lifePops = []

    /**
     * @param {LifeType} lifeType
     * @param {Tile} tile
     * @returns {boolean}
     */
    const canLifeTypeSurviveOnTile = function(lifeType, tile) {
        const correctTerrain = (lifeType.isLandInhabiting && tile.tileCover == TileCover.Rock) || (lifeType.isWaterInhabiting && tile.tileCover == TileCover.Water)
        const correctHeat = tile.heat >= lifeType.minTemperature && tile.heat <= lifeType.maxTemperature
        return correctTerrain && correctHeat
    }

    /**
     * @param {LifeType} lifeType
     * @param {Atmosphere} localAtmosphere
     * @returns {boolean}
     */
    const canLifeTypeSurviveInAtmosphere = function(lifeType, localAtmosphere) {
        if (lifeType.isPlant) {
            return localAtmosphere.carbonDioxide >= lifeType.minBreathableAtmosphere
        }
        else {
            return localAtmosphere.oxygen >= lifeType.minBreathableAtmosphere
        }
    }

    return {
        getLifePop: function(type) {
            var pop = lifePops.find(function(lifePop) { return lifePop.type == type })
            if (!pop) {
                pop = { type: type, population: 0 }
                lifePops.push(pop)
            }

            return pop
        },
        tick: function(localAtmosphere, worldAtmosphere, tile) {
            lifePops.forEach(function(lifePop) {
                if (!canLifeTypeSurviveOnTile(lifePop.type, tile) || !canLifeTypeSurviveInAtmosphere(lifePop.type, localAtmosphere)) {
                    lifePop.population = 0
                }

                lifePop.population += lifePop.population * lifePop.type.reproductionRate
                if (lifePop.type.isPlant) {
                    lifePop.population = Math.min(lifePop.population, tile.baseLuminosity * fullLuminosityHeat * photosynthticBiomassPerEnergy)
                }

                if (lifePop.type.isPlant) {
                    worldAtmosphere.carbonDioxide -= lifePop.population * carbonPerPhotosyntheticBiomass
                    worldAtmosphere.oxygen += lifePop.population * oxygenPerPhotosyntheticBiomass
                }
            })
        },
        transfer: function(horizontalTile, verticalTile) {
            lifePops.forEach(function(lifePop) {
                const type = lifePop.type
                if (canLifeTypeSurviveOnTile(type, tile)) {
                    const horizontalPop = horizontalTile.biomass.getLifePop(type)
                    if (canLifeTypeSurviveOnTile(type, horizontalTile) && (lifePop.population > 2 || horizontalPop.population > 2)) {
                        const horizontalAvePop = (lifePop.population + horizontalPop.population) / 2
                        horizontalPop.population = horizontalAvePop
                        lifePop.population = horizontalAvePop
                    }
                    
                    if (verticalTile) {
                        const verticalPop = verticalTile.biomass.getLifePop(type)
                        if (canLifeTypeSurviveOnTile(type, verticalTile) && (lifePop.population > 2 || verticalPop.population > 2)) {
                            const verticalAvePop = (lifePop.population + verticalPop.population) / 2
                            verticalPop.population = verticalAvePop
                            lifePop.population = verticalAvePop
                        }
                    }
                }
            })
        },
        abiogenesis: function() {
            if (this.getLifePop(LifeTypes.Plankton).population == 0 && canLifeTypeSurviveOnTile(LifeTypes.Plankton, tile) && tile.heat >= prokaryoteAbiogenesisMinHeat && Math.random() < planktonAbiogenesisChance) {
                this.getLifePop(LifeTypes.Plankton).population = 1
            }
        },
    }
}

const w = World()
w.draw()
setInterval(function() {
    w.tick()
    w.draw()
    w.updateStats()
}, 100)
