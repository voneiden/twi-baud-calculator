import React from 'react';
import './App.scss';
import {types} from "mobx-state-tree";
import {observer} from "mobx-react";

const I2CSpec = [
  {
    id: 0,
    name: 'Standard Mode',
    maxKHzBus: 100,
    maxNanoRise: 1000,
    maxPF: 400,
    maxLowVoltage: 0.4,
    maxLowVoltageBelowTwo: () => NaN,
    minBaud: 1,
  },
  {
    id: 1,
    name: 'Fast Mode',
    maxKHzBus: 400,
    maxNanoRise: 300,
    maxPF: 400,
    maxLowVoltage: 0.4,
    maxLowVoltageBelowTwo: vcc => 0.2 * vcc,
    minBaud: 1,
  },
  {
    id: 2,
    name: 'Fast Mode Plus',
    maxKHzBus: 1000,
    maxNanoRise: 120,
    maxPF: 550,
    maxLowVoltage: 0.4,
    maxLowVoltageBelowTwo: vcc => 0.2 * vcc,
    minBaud: 3,
  }
]

const FormModel = types.model({
  twiMode: types.optional(types.number, 0),
  vcc: types.optional(types.string, '5.0'),
  pF: types.optional(types.string, '40'),
  kOhm: types.optional(types.string, '4.7'),
  MHzMcu: types.optional(types.string, '20'),
  kHzBus: types.optional(types.string, '100'),
}).actions(self => ({
  setTwiMode: function setTwiMode(twiMode) {
    self.twiMode = twiMode
    const spec = I2CSpec[twiMode]
    self.kHzBus = spec.maxKHzBus.toString()
  },
  setVcc: function setVcc(vcc) {
    self.vcc = vcc
  },
  setPF: function setPf(pF) {
    self.pF = pF
  },
  setKOhm: function setKOhm(kOhm) {
    self.kOhm = kOhm
  },
  setMHzMcu: function setMHzMcu(MHzMcu) {
    self.MHzMcu = MHzMcu
  },
  setKHzBus: function setKHzBus(kHzBus) {
    self.kHzBus = kHzBus
  },
}))

const StoreModel = types.model({
  form: FormModel
}).views(self => ({
  get spec() {
    return I2CSpec[self.form.twiMode]
  },
  get nanoRiseTime() {
    return 0.8473 * parseFloat(self.form.kOhm) * parseFloat(self.form.pF)
  },
  get sinkMA() {
    return parseFloat(self.form.vcc) >= 2 ? 3 : 2
  },
  get maxLowVoltage() {
    const vcc = parseFloat(self.form.vcc)
    return vcc >= 2 ? self.spec.maxLowVoltage : self.spec.maxLowVoltageBelowTwo(vcc)
  },
  get minR() {
    return (parseFloat(self.form.vcc) - self.maxLowVoltage) / self.sinkMA
  },
  get maxR() {
    return self.spec.maxNanoRise / (0.8473 * parseFloat(self.form.pF))
  },
  get baud() {
    const riseTime = self.nanoRiseTime / 1e9
    const MHzMcu = parseFloat(self.form.MHzMcu) * 1000000
    const kHzBus = parseFloat(self.form.kHzBus) * 1000
    return (MHzMcu - kHzBus * MHzMcu * riseTime - kHzBus * 10) / (kHzBus * 2)
  }
}))

const store = StoreModel.create({form: FormModel.create({})})

const prefixSI = function prefixSI(value) {
  if (value >= 1000000) {
    return ['M', 1000000]
  } else if (value >= 1000) {
    return ['k', 1000]
  }
  return ['', 1]
}

const friendlyFrequency = function friendlyFrequency(frequency) {
  const [suffix, divider] = prefixSI(frequency)
  return `${Math.trunc(frequency / divider)} ${suffix}Hz`
}


const TWIMode = observer(function TWIMode() {
  const {spec} = store
  const {twiMode, setTwiMode} = store.form

  const modeSelectors = I2CSpec.map(spec => {
    return (
      <button
        key={spec.id}
        onClick={e => setTwiMode(spec.id)}
        className={twiMode === spec.id ? 'selected' : ''}
      >{spec.name} ({friendlyFrequency(spec.maxKHzBus * 1000)})</button>
    )
  })


  return (
    <div className='twi-mode'>
      {modeSelectors}
      <div className="row">
        <div>Max T<sub>rise</sub></div>
        <div>{spec.maxNanoRise}</div>
        <div>ns</div>
      </div>
      <div className="row margin-bottom">
        <div>Max capacitance</div>
        <div>{spec.maxPF}</div>
        <div>pF</div>
      </div>
    </div>
  )
})

const RiseTimeCalculator = observer(function RiseTimeCalclator() {
  const {maxLowVoltage, minR, maxR, spec} = store
  const {vcc, setVcc, pF, setPF, kOhm, setKOhm} = store.form

  return (
    <div className='rise-time-calculator border-block'>
      <div className='row'>
        <div>VCC</div>
        <input className={isNaN(maxLowVoltage) ? 'error' : ''} value={vcc} onChange={e => setVcc(e.target.value)}/>
        <div>V</div>
      </div>
      <div className='row'>
        <div>Bus capacitance</div>
        <input className={pF > spec.maxPF ? 'error' : ''} value={pF} onChange={e => setPF(e.target.value)}/>
        <div>pF</div>
      </div>
      <div className='row'>
        <div>Bus pull-up resistance</div>
        <input className={(kOhm > maxR || kOhm < minR) ? 'error' : ''} value={kOhm}
               onChange={e => setKOhm(e.target.value)}/>
        <div>kΩ (&gt;{minR.toFixed(1)} kΩ, &lt;{maxR.toFixed(1)} kΩ)</div>
      </div>
    </div>
  )
})

const BaudRateCalculator = observer(function BaudRateCalculator(props) {
  const {baud, nanoRiseTime, spec} = store
  const {MHzMcu, setMHzMcu, kHzBus, setKHzBus} = store.form

  return (
    <div className='baud-rate-calculator border-block'>
      <div className='row'>
        <div>MCU frequency</div>
        <input value={MHzMcu} onChange={e => setMHzMcu(e.target.value)}/>
        <div>MHz</div>
      </div>
      <div className='row margin-bottom'>
        <div>Bus frequency</div>
        <input className={kHzBus > spec.maxKHzBus ? 'error' : ''} value={kHzBus}
               onChange={e => setKHzBus(e.target.value)}/>
        <div>kHz</div>
      </div>
      <div className='rise-time'>T<sub>rise</sub> is {Math.trunc(nanoRiseTime)} ns</div>
      <div className='baud'>BAUD is {Math.ceil(baud)}</div>
      {spec.minBaud > Math.ceil(baud) && <div className='error'>Baud cannot be less than {spec.minBaud} in {spec.name}</div>}
    </div>
  )
})

const MainView = function MainView() {

  return (
    <div className="main-view">
      <div className='title'>TWI I<sup>2</sup>C BAUD Calculator</div>
      <div className='subtitle'>For ATtiny 1-series and similar devices</div>

      <TWIMode/>
      <RiseTimeCalculator/>
      <BaudRateCalculator/>

      <div className='info'>
        <p>Estimate your TWI I<sup>2</sup>C BAUD rate and pull-up resistors.</p>
        <p>
          A pull-up resistance that is too high may not manage to pull the signal to logic high during a single clock
          cycle.
        </p>
        <p>
          A pull-up resistance that is too low may lead to bus devices being unable to sink enough current to pull the signal
          to logic low.
        </p>
        <p>
          Bus capacitance, if measuring is not possible, can be very roughly estimated by adding 20 pF for every device on the bus if distances are
          short.
        </p>
        <p>
          BAUD in this context determines how long a clock signal is kept high after a high level is detected.
          Therefore a higher
          BAUD results in a slower bus clock. In practice due to bus capacitance and pull-up resistance some time of the
          clock cycle is
          lost while the bus voltage rises to a logic high (T<sub>rise</sub>). To compensate for this, BAUD can be set
          to a lower value.
        </p>
      </div>
    </div>
  );
}

export default MainView;
